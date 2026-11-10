package com.photowall;

import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class Database implements ApplicationRunner {
    private final JdbcTemplate jdbc;
    private final PasswordEncoder encoder;
    private final String adminEmail;
    private final String adminPassword;

    public Database(JdbcTemplate jdbc, PasswordEncoder encoder,
                    @Value("${photowall.admin.email}") String adminEmail,
                    @Value("${photowall.admin.password}") String adminPassword) {
        this.jdbc = jdbc;
        this.encoder = encoder;
        this.adminEmail = adminEmail.trim().toLowerCase();
        this.adminPassword = adminPassword;
    }

    @Override
    public void run(ApplicationArguments args) {
        jdbc.execute("PRAGMA journal_mode=WAL");
        List<String> schema = List.of(
            "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('ADMIN','VIEWER')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
            "CREATE TABLE IF NOT EXISTS albums (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', is_public INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
            "CREATE TABLE IF NOT EXISTS photos (id INTEGER PRIMARY KEY AUTOINCREMENT, album_id INTEGER NOT NULL, stored_name TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', taken_at TEXT, country TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '', latitude REAL, longitude REAL, visibility TEXT NOT NULL DEFAULT 'PUBLIC' CHECK(visibility IN ('PUBLIC','PRIVATE')), sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
            "CREATE INDEX IF NOT EXISTS idx_photos_album ON photos(album_id, sort_order, id)",
            "CREATE TABLE IF NOT EXISTS timeline_notes (month TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '')",
            "CREATE TABLE IF NOT EXISTS remember_logins (series TEXT PRIMARY KEY, username TEXT NOT NULL, token TEXT NOT NULL, last_used INTEGER NOT NULL, expires_at INTEGER NOT NULL, password_hash TEXT NOT NULL)",
            "CREATE INDEX IF NOT EXISTS idx_remember_logins_user ON remember_logins(username)",
            "CREATE TABLE IF NOT EXISTS album_grants (album_id INTEGER NOT NULL, user_id INTEGER NOT NULL, PRIMARY KEY(album_id,user_id))",
            "CREATE TABLE IF NOT EXISTS invitations (id INTEGER PRIMARY KEY AUTOINCREMENT, album_id INTEGER NOT NULL, email TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, accepted_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
        );
        schema.forEach(jdbc::execute);
        boolean hasCapturedAt = jdbc.queryForList("PRAGMA table_info(photos)").stream().anyMatch(column -> "captured_at".equals(column.get("name")));
        if (!hasCapturedAt) jdbc.execute("ALTER TABLE photos ADD COLUMN captured_at TEXT");
        Integer admins = jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE role='ADMIN'", Integer.class);
        if (admins != null && admins == 0) {
            if (adminEmail.isBlank() || adminPassword.length() < 12) {
                throw new IllegalStateException("Set PHOTOWALL_ADMIN_EMAIL and a PHOTOWALL_ADMIN_PASSWORD of at least 12 characters for first startup");
            }
            jdbc.update("INSERT INTO users(email,password_hash,role) VALUES(?,?,'ADMIN')", adminEmail, encoder.encode(adminPassword));
        }
    }
}
