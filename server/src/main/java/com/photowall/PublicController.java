package com.photowall;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class PublicController {
    private final CatalogService catalog;
    public PublicController(CatalogService catalog) { this.catalog = catalog; }

    @GetMapping("/auth/me")
    public Map<String, Object> me(Authentication auth, HttpServletRequest request) {
        CsrfToken token = (CsrfToken) request.getAttribute(CsrfToken.class.getName());
        boolean loggedIn = catalog.userId(auth) != null;
        return Map.of("authenticated", loggedIn,
            "email", loggedIn ? auth.getName() : "",
            "role", loggedIn ? (catalog.isAdmin(auth) ? "ADMIN" : "VIEWER") : "GUEST",
            "csrfToken", token == null ? "" : token.getToken());
    }

    @GetMapping("/albums")
    public Object albums(Authentication auth) { return catalog.albums(auth); }

    @GetMapping("/photos")
    public Object photos(Authentication auth, @RequestParam(required = false) Long albumId) {
        return catalog.photos(auth, albumId);
    }

    @GetMapping("/photos/{id}")
    public Object photo(Authentication auth, @PathVariable long id) { return catalog.photo(id, auth); }
}
