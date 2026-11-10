package com.photowall;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/invitations")
public class InvitationController {
    private final JdbcTemplate jdbc;
    private final PasswordEncoder encoder;
    private final CatalogService catalog;

    public InvitationController(JdbcTemplate jdbc, PasswordEncoder encoder, CatalogService catalog) {
        this.jdbc = jdbc; this.encoder = encoder; this.catalog = catalog;
    }

    private record Invitation(long id, long albumId, String albumTitle, String email, String expiresAt, String acceptedAt) {}
    public record AcceptInput(String token, String password) {}

    @GetMapping("/preview")
    public Object preview(@RequestParam String token) {
        Invitation invite = requireValid(token);
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE email=?", Integer.class, invite.email());
        return Map.of("albumTitle", invite.albumTitle(), "email", invite.email(), "existingAccount", count != null && count > 0);
    }

    @PostMapping("/accept")
    @Transactional
    public Object accept(@RequestBody AcceptInput input, Authentication auth) {
        Invitation invite = requireValid(input.token());
        List<Long> users = jdbc.query("SELECT id FROM users WHERE email=?", (rs, row) -> rs.getLong(1), invite.email());
        long userId;
        if (users.isEmpty()) {
            if (input.password() == null || input.password().length() < 12)
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "密码至少需要 12 个字符");
            jdbc.update("INSERT INTO users(email,password_hash,role) VALUES(?,?,'VIEWER')", invite.email(), encoder.encode(input.password()));
            userId = jdbc.queryForObject("SELECT id FROM users WHERE email=?", Long.class, invite.email());
        } else {
            if (auth == null || !auth.isAuthenticated() || !auth.getName().equalsIgnoreCase(invite.email()))
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "请先使用受邀邮箱登录");
            userId = users.getFirst();
        }
        jdbc.update("INSERT OR IGNORE INTO album_grants(album_id,user_id) VALUES(?,?)", invite.albumId(), userId);
        jdbc.update("UPDATE invitations SET accepted_at=? WHERE id=? AND accepted_at IS NULL", Instant.now().toString(), invite.id());
        return Map.of("ok", true, "albumId", invite.albumId());
    }

    private Invitation requireValid(String token) {
        if (token == null || token.length() > 200) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "邀请链接无效");
        List<Invitation> rows = jdbc.query("SELECT i.id,i.album_id,a.title,i.email,i.expires_at,i.accepted_at FROM invitations i JOIN albums a ON a.id=i.album_id WHERE i.token_hash=?",
            (rs, row) -> new Invitation(rs.getLong(1), rs.getLong(2), rs.getString(3), rs.getString(4), rs.getString(5), rs.getString(6)),
            AdminController.hash(token));
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "邀请链接无效");
        Invitation invite = rows.getFirst();
        if (invite.acceptedAt() != null || !Instant.parse(invite.expiresAt()).isAfter(Instant.now()))
            throw new ResponseStatusException(HttpStatus.GONE, "邀请链接已使用或过期");
        return invite;
    }
}
