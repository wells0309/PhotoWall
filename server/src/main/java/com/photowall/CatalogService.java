package com.photowall;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CatalogService {
    private final JdbcTemplate jdbc;

    public CatalogService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public record Album(long id, String title, String description, boolean isPublic, int photoCount, boolean hasAccess) {}
    public record Photo(long id, long albumId, String albumTitle, String title, String description,
                        String takenAt, String country, String city, Double latitude, Double longitude,
                        String visibility, int sortOrder, String displayUrl, String capturedAt) {}

    public List<Album> albums(Authentication auth) {
        List<Album> result = new ArrayList<>();
        boolean admin = isAdmin(auth);
        Set<Long> grantedAlbums = grantedAlbums(auth);
        var counts = photos(auth, null).stream().collect(Collectors.groupingBy(Photo::albumId, Collectors.counting()));
        for (var row : jdbc.queryForList("SELECT id,title,description,is_public FROM albums ORDER BY created_at DESC,id DESC")) {
            long id = ((Number) row.get("id")).longValue();
            boolean isPublic = ((Number) row.get("is_public")).intValue() == 1;
            boolean granted = grantedAlbums.contains(id);
            if (!isPublic && !granted && !admin) continue;
            int count = counts.getOrDefault(id, 0L).intValue();
            result.add(new Album(id, (String) row.get("title"), (String) row.get("description"),
                isPublic, count, admin || granted));
        }
        return result;
    }

    public List<Photo> photos(Authentication auth, Long albumId) {
        String sql = "SELECT p.*,a.title AS album_title,a.is_public FROM photos p JOIN albums a ON a.id=p.album_id" +
            (albumId == null ? "" : " WHERE p.album_id=?") +
            " ORDER BY p.sort_order ASC,p.id DESC";
        List<PhotoRow> rows = albumId == null
            ? jdbc.query(sql, this::mapPhoto)
            : jdbc.query(sql, this::mapPhoto, albumId);
        boolean admin = isAdmin(auth);
        Set<Long> granted = grantedAlbums(auth);
        return rows.stream().filter(row -> admin || granted.contains(row.albumId()) ||
            (row.albumPublic() && Objects.equals(row.visibility(), "PUBLIC"))).map(this::toPhoto).toList();
    }

    public Photo photo(long id, Authentication auth) {
        PhotoRow row = requirePhoto(id);
        if (!canSee(row, auth)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return toPhoto(row);
    }

    public PhotoRow requirePhoto(long id) {
        List<PhotoRow> rows = jdbc.query("SELECT p.*,a.title AS album_title,a.is_public FROM photos p JOIN albums a ON a.id=p.album_id WHERE p.id=?", this::mapPhoto, id);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "照片不存在");
        return rows.getFirst();
    }

    public void requireAlbum(long id) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM albums WHERE id=?", Integer.class, id);
        if (count == null || count == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "相册不存在");
    }

    public boolean canSee(PhotoRow row, Authentication auth) {
        if (isAdmin(auth)) return true;
        if (hasGrant(row.albumId(), auth)) return true;
        return row.albumPublic() && Objects.equals(row.visibility(), "PUBLIC");
    }

    public boolean isAdmin(Authentication auth) {
        return auth != null && auth.isAuthenticated() && auth.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN"));
    }

    public Long userId(Authentication auth) {
        if (auth == null || !auth.isAuthenticated() || auth.getName().equals("anonymousUser")) return null;
        List<Long> ids = jdbc.query("SELECT id FROM users WHERE email=?", (rs, row) -> rs.getLong(1), auth.getName().toLowerCase());
        return ids.isEmpty() ? null : ids.getFirst();
    }

    public boolean hasGrant(long albumId, Authentication auth) {
        return grantedAlbums(auth).contains(albumId);
    }

    private Set<Long> grantedAlbums(Authentication auth) {
        Long userId = userId(auth);
        if (userId == null) return Set.of();
        return Set.copyOf(jdbc.query("SELECT album_id FROM album_grants WHERE user_id=?", (rs, row) -> rs.getLong(1), userId));
    }

    private Photo toPhoto(PhotoRow row) {
        return new Photo(row.id(), row.albumId(), row.albumTitle(), row.title(), row.description(),
            row.takenAt(), row.country(), row.city(), row.latitude(), row.longitude(),
            row.visibility(), row.sortOrder(), "/api/media/" + row.id(), row.capturedAt());
    }

    private PhotoRow mapPhoto(ResultSet rs, int ignored) throws SQLException {
        double rawLatitude = rs.getDouble("latitude");
        Double latitude = rs.wasNull() ? null : rawLatitude;
        double rawLongitude = rs.getDouble("longitude");
        Double longitude = rs.wasNull() ? null : rawLongitude;
        return new PhotoRow(rs.getLong("id"), rs.getLong("album_id"), rs.getString("album_title"),
            rs.getInt("is_public") == 1, rs.getString("stored_name"), rs.getString("mime_type"),
            rs.getString("title"), rs.getString("description"), rs.getString("taken_at"),
            rs.getString("country"), rs.getString("city"), latitude, longitude,
            rs.getString("visibility"), rs.getInt("sort_order"), rs.getString("captured_at"));
    }

    public record PhotoRow(long id, long albumId, String albumTitle, boolean albumPublic,
                           String storedName, String mimeType, String title, String description,
                           String takenAt, String country, String city, Double latitude,
                           Double longitude, String visibility, int sortOrder, String capturedAt) {}
}
