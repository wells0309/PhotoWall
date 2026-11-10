package com.photowall;

import java.io.IOException;
import java.util.List;
import java.time.Clock;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import jakarta.servlet.http.HttpServletResponse;

@Configuration
public class SecurityConfig {
    @Bean
    Clock rememberMeClock() { return Clock.systemUTC(); }

    @Bean
    SevenDayRememberMeServices rememberMeServices(UserDetailsService users, RememberLoginRepository repository,
            @Value("${server.servlet.session.cookie.secure:false}") boolean secureCookie) {
        return new SevenDayRememberMeServices(users, repository, secureCookie);
    }
    @Bean
    PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(); }

    @Bean
    UserDetailsService userDetailsService(JdbcTemplate jdbc) {
        return email -> {
            List<UserRow> rows = jdbc.query("SELECT email,password_hash,role FROM users WHERE email=?",
                (rs, row) -> new UserRow(rs.getString(1), rs.getString(2), rs.getString(3)), email.toLowerCase());
            if (rows.isEmpty()) throw new UsernameNotFoundException(email);
            UserRow user = rows.getFirst();
            return User.withUsername(user.email()).password(user.hash()).roles(user.role()).build();
        };
    }

    private record UserRow(String email, String hash, String role) {}

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, SevenDayRememberMeServices rememberMe) throws Exception {
        return http
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/admin/**").hasRole("ADMIN")
                .requestMatchers(HttpMethod.GET, "/api/**").permitAll()
                .requestMatchers("/api/invitations/accept", "/api/auth/login", "/api/auth/logout").permitAll()
                .anyRequest().permitAll())
            .formLogin(form -> form.loginProcessingUrl("/api/auth/login")
                .successHandler((request, response, authentication) -> json(response, 200, "{\"ok\":true}"))
                .failureHandler((request, response, exception) -> json(response, 401, "{\"error\":\"邮箱或密码错误\"}")))
            .rememberMe(remember -> remember.key(SevenDayRememberMeServices.PROVIDER_KEY).rememberMeServices(rememberMe))
            .logout(logout -> logout.logoutUrl("/api/auth/logout")
                .logoutSuccessHandler((request, response, authentication) -> json(response, 200, "{\"ok\":true}")))
            .exceptionHandling(ex -> ex.authenticationEntryPoint((request, response, error) -> json(response, 401, "{\"error\":\"请先登录\"}"))
                .accessDeniedHandler((request, response, error) -> json(response, 403, "{\"error\":\"没有访问权限\"}")))
            .build();
    }

    private static void json(HttpServletResponse response, int code, String body) throws IOException {
        response.setStatus(code);
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write(body);
    }
}
