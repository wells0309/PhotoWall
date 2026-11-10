package com.photowall;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@Import(RememberLoginIntegrationTest.ClockConfig.class)
@TestPropertySource(properties = {
    "photowall.data-dir=target/remember-test-data",
    "photowall.admin.email=remember@example.test",
    "photowall.admin.password=remember-test-password-123",
    "server.servlet.session.cookie.secure=true"
})
class RememberLoginIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordEncoder encoder;
    @Autowired MutableClock clock;

    @BeforeEach
    void resetTokens() {
        clock.now = Instant.now();
        jdbc.update("DELETE FROM remember_logins");
        jdbc.update("UPDATE users SET password_hash=? WHERE email='remember@example.test'", encoder.encode("remember-test-password-123"));
    }

    Cookie login() throws Exception {
        return mvc.perform(post("/api/auth/login").secure(true).with(csrf())
            .param("username", "remember@example.test").param("password", "remember-test-password-123"))
            .andExpect(status().isOk()).andReturn().getResponse().getCookie(SevenDayRememberMeServices.COOKIE_NAME);
    }

    @Test
    void loginAutomaticallyIssuesSevenDayProtectedCookie() throws Exception {
        Cookie cookie = login();
        assertThat(cookie).isNotNull();
        assertThat(cookie.getMaxAge()).isEqualTo(604800);
        assertThat(cookie.isHttpOnly()).isTrue();
        assertThat(cookie.getSecure()).isTrue();
        assertThat(cookie.getAttribute("SameSite")).isEqualTo("Lax");
        assertThat(cookie.getPath()).isEqualTo("/");
        assertThat(cookie.getValue()).doesNotContain("remember@example.test", "password");
        assertThat(jdbc.queryForObject("SELECT expires_at FROM remember_logins", Long.class)).isEqualTo(clock.millis() + Duration.ofDays(7).toMillis());
    }

    @Test
    void freshBrowserSessionRestoresLoginAndDoesNotExtendDeadline() throws Exception {
        Cookie cookie = login();
        long deadline = jdbc.queryForObject("SELECT expires_at FROM remember_logins", Long.class);
        clock.now = clock.now.plus(Duration.ofDays(6));
        var response = mvc.perform(get("/api/auth/me").secure(true).cookie(cookie))
            .andExpect(status().isOk()).andReturn().getResponse();
        assertThat(response.getContentAsString()).contains("\"authenticated\":true", "\"role\":\"ADMIN\"");
        Cookie rotated = response.getCookie(SevenDayRememberMeServices.COOKIE_NAME);
        assertThat(rotated.getValue()).isNotEqualTo(cookie.getValue());
        assertThat(rotated.getMaxAge()).isEqualTo(86400);
        assertThat(jdbc.queryForObject("SELECT expires_at FROM remember_logins", Long.class)).isEqualTo(deadline);
        clock.now = clock.now.plus(Duration.ofDays(1));
        String expired = mvc.perform(get("/api/auth/me").secure(true).cookie(rotated))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(expired).contains("\"authenticated\":false");
    }

    @Test
    void expirationClearsCookieAndRejectsAdminAccess() throws Exception {
        Cookie cookie = login();
        clock.now = clock.now.plus(Duration.ofDays(7));
        var response = mvc.perform(get("/api/admin/stats").secure(true).cookie(cookie))
            .andExpect(status().isUnauthorized()).andReturn().getResponse();
        assertThat(response.getCookie(SevenDayRememberMeServices.COOKIE_NAME).getMaxAge()).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM remember_logins", Integer.class)).isZero();
    }

    @Test
    void logoutWithoutHttpSessionRevokesRememberedLogin() throws Exception {
        Cookie cookie = login();
        var response = mvc.perform(post("/api/auth/logout").secure(true).with(csrf()).cookie(cookie))
            .andExpect(status().isOk()).andReturn().getResponse();
        assertThat(response.getCookie(SevenDayRememberMeServices.COOKIE_NAME).getMaxAge()).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM remember_logins", Integer.class)).isZero();
        mvc.perform(get("/api/admin/stats").secure(true).cookie(cookie)).andExpect(status().isUnauthorized());
    }

    @Test
    void invalidCookieAndIncorrectPasswordCannotCreateLogin() throws Exception {
        mvc.perform(get("/api/admin/stats").secure(true).cookie(new Cookie(SevenDayRememberMeServices.COOKIE_NAME, "invalid")))
            .andExpect(status().isUnauthorized());
        var response = mvc.perform(post("/api/auth/login").secure(true).with(csrf())
            .param("username", "remember@example.test").param("password", "incorrect"))
            .andExpect(status().isUnauthorized()).andReturn().getResponse();
        assertThat(response.getCookie(SevenDayRememberMeServices.COOKIE_NAME).getMaxAge()).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM remember_logins", Integer.class)).isZero();
    }

    @Test
    void changingPasswordRevokesStoredLogin() throws Exception {
        Cookie cookie = login();
        jdbc.update("UPDATE users SET password_hash=? WHERE email='remember@example.test'", encoder.encode("changed-password-123"));
        mvc.perform(get("/api/admin/stats").secure(true).cookie(cookie)).andExpect(status().isUnauthorized());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM remember_logins", Integer.class)).isZero();
    }

    @Test
    void rememberedLoginStillRequiresCsrfForWrites() throws Exception {
        Cookie cookie = login();
        mvc.perform(post("/api/admin/albums").secure(true).cookie(cookie).contentType("application/json").content("{\"title\":\"Blocked\"}"))
            .andExpect(status().isForbidden());
    }

    @TestConfiguration
    static class ClockConfig {
        @Bean @Primary MutableClock testClock() { return new MutableClock(); }
    }

    static class MutableClock extends Clock {
        Instant now = Instant.now();
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }
}
