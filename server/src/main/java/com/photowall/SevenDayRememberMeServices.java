package com.photowall;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.web.authentication.rememberme.InvalidCookieException;
import org.springframework.security.web.authentication.rememberme.PersistentTokenBasedRememberMeServices;

public class SevenDayRememberMeServices extends PersistentTokenBasedRememberMeServices {
    public static final String COOKIE_NAME = "photowall-login";
    // Provider identifier only; authentication relies on random, database-backed tokens.
    public static final String PROVIDER_KEY = "photowall-persistent-login-v1";
    private final RememberLoginRepository repository;

    public SevenDayRememberMeServices(UserDetailsService users, RememberLoginRepository repository, boolean secureCookie) {
        super(PROVIDER_KEY, users, repository);
        this.repository = repository;
        setAlwaysRemember(true);
        setCookieName(COOKIE_NAME);
        setTokenValiditySeconds(RememberLoginRepository.VALIDITY_SECONDS);
        setSeriesLength(32);
        setTokenLength(32);
        if (secureCookie) setUseSecureCookie(true);
        setCookieCustomizer(cookie -> cookie.setAttribute("SameSite", "Lax"));
    }

    @Override
    protected void setCookie(String[] tokens, int maxAge, HttpServletRequest request, HttpServletResponse response) {
        if (maxAge > 0 && tokens != null && tokens.length > 0) {
            maxAge = Math.min(maxAge, repository.remainingSeconds(tokens[0]));
        }
        super.setCookie(tokens, maxAge, request, response);
    }

    @Override
    public void logout(HttpServletRequest request, HttpServletResponse response, Authentication authentication) {
        // Logout must revoke the presented token even after its HTTP session expires.
        String cookie = extractRememberMeCookie(request);
        if (cookie != null) {
            try {
                String[] tokens = decodeCookie(cookie);
                if (tokens.length == 2) repository.removeSeries(tokens[0]);
            } catch (InvalidCookieException ignored) { /* The cookie is still cleared below. */ }
        }
        super.logout(request, response, authentication);
    }
}
