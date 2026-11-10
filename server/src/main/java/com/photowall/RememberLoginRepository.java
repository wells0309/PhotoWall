package com.photowall;

import java.time.Clock;
import java.util.Date;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.web.authentication.rememberme.PersistentRememberMeToken;
import org.springframework.security.web.authentication.rememberme.PersistentTokenRepository;
import org.springframework.stereotype.Repository;

@Repository
public class RememberLoginRepository implements PersistentTokenRepository {
    public static final int VALIDITY_SECONDS = 7 * 24 * 60 * 60;
    private final JdbcTemplate jdbc;
    private final Clock clock;

    public RememberLoginRepository(JdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Override
    public void createNewToken(PersistentRememberMeToken token) {
        long now = clock.millis();
        jdbc.update("DELETE FROM remember_logins WHERE expires_at<=?", now);
        String passwordHash = jdbc.queryForObject("SELECT password_hash FROM users WHERE email=?", String.class, token.getUsername());
        jdbc.update("INSERT INTO remember_logins(series,username,token,last_used,expires_at,password_hash) VALUES(?,?,?,?,?,?)",
            token.getSeries(), token.getUsername(), token.getTokenValue(), now, now + VALIDITY_SECONDS * 1000L, passwordHash);
    }

    @Override
    public void updateToken(String series, String tokenValue, Date lastUsed) {
        // Rotate the token without extending the original seven-day deadline.
        jdbc.update("UPDATE remember_logins SET token=?,last_used=? WHERE series=? AND expires_at>?",
            tokenValue, clock.millis(), series, clock.millis());
    }

    @Override
    public PersistentRememberMeToken getTokenForSeries(String series) {
        var tokens = jdbc.query("SELECT r.* FROM remember_logins r JOIN users u ON u.email=r.username AND u.password_hash=r.password_hash WHERE r.series=? AND r.expires_at>?",
            (rs, row) -> new PersistentRememberMeToken(rs.getString("username"), rs.getString("series"), rs.getString("token"), new Date(rs.getLong("last_used"))),
            series, clock.millis());
        if (tokens.isEmpty()) { removeSeries(series); return null; }
        return tokens.getFirst();
    }

    public int remainingSeconds(String series) {
        var expires = jdbc.query("SELECT expires_at FROM remember_logins WHERE series=?", (rs, row) -> rs.getLong(1), series);
        return expires.isEmpty() ? 0 : (int) Math.max(0, (expires.getFirst() - clock.millis() + 999) / 1000);
    }

    public void removeSeries(String series) { jdbc.update("DELETE FROM remember_logins WHERE series=?", series); }

    @Override
    public void removeUserTokens(String username) { jdbc.update("DELETE FROM remember_logins WHERE username=?", username); }
}
