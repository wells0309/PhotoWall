package com.photowall;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/admin")
public class AdminController {
    private final JdbcTemplate jdbc;
    private final CatalogService catalog;
    private final PhotoStorage storage;
    private final Path dataDir;
    private final long quotaBytes;
    private final SecureRandom random = new SecureRandom();
    private final PhotoMetadata metadataReader;

    public AdminController(JdbcTemplate jdbc, CatalogService catalog, PhotoStorage storage, Path dataDir,
                           @Value("${photowall.photo-quota-bytes}") long quotaBytes, PhotoMetadata metadataReader) {
        this.jdbc = jdbc; this.catalog = catalog; this.storage = storage; this.dataDir = dataDir; this.quotaBytes = quotaBytes;
        this.metadataReader = metadataReader;
    }

    public record AlbumInput(String title, String description, Boolean isPublic) {}
    public record PhotoInput(String title, String description, String takenAt, String country,
                             String city, Double latitude, Double longitude, String visibility, String capturedAt) {}
    public record ReorderInput(long albumId, List<Long> photoIds) {}
    public record InviteInput(String email) {}

    @GetMapping("/stats")
    public Object stats() throws IOException {
        try (var files = Files.list(dataDir.resolve("originals"))) {
            long bytes = files.filter(Files::isRegularFile).mapToLong(path -> {
                try { return Files.size(path); } catch (IOException ex) { return 0L; }
            }).sum();
            return Map.of("usedBytes", bytes, "quotaBytes", quotaBytes);
        }
    }

    @PostMapping("/albums")
    public Object createAlbum(@RequestBody AlbumInput input) {
        String title = required(input.title(), "相册名称", 80);
        jdbc.update("INSERT INTO albums(title,description,is_public) VALUES(?,?,?)", title,
            clean(input.description(), 2000), Boolean.FALSE.equals(input.isPublic()) ? 0 : 1);
        Long id = jdbc.queryForObject("SELECT id FROM albums ORDER BY id DESC LIMIT 1", Long.class);
        return Map.of("id", id);
    }

    @PutMapping("/albums/{id}")
    public Object updateAlbum(@PathVariable long id, @RequestBody AlbumInput input) {
        catalog.requireAlbum(id);
        jdbc.update("UPDATE albums SET title=?,description=?,is_public=? WHERE id=?",
            required(input.title(), "相册名称", 80), clean(input.description(), 2000),
            Boolean.FALSE.equals(input.isPublic()) ? 0 : 1, id);
        return Map.of("ok", true);
    }

    @DeleteMapping("/albums/{id}")
    public Object deleteAlbum(@PathVariable long id) {
        catalog.requireAlbum(id);
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM photos WHERE album_id=?", Integer.class, id);
        if (count != null && count > 0) throw new ResponseStatusException(HttpStatus.CONFLICT, "请先移除相册中的照片");
        jdbc.update("DELETE FROM album_grants WHERE album_id=?", id);
        jdbc.update("DELETE FROM invitations WHERE album_id=?", id);
        jdbc.update("DELETE FROM albums WHERE id=?", id);
        return Map.of("ok", true);
    }

    @PostMapping("/photos/metadata")
    public PhotoMetadata.Info metadata(@RequestParam MultipartFile file) throws IOException {
        if (file.isEmpty() || file.getSize() > 25L * 1024 * 1024)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请选择不超过 25MB 的照片");
        try (var input = file.getInputStream()) { return metadataReader.read(input); }
    }

    @PostMapping("/photos")
    public Object upload(@RequestParam long albumId, @RequestParam MultipartFile file,
        @RequestParam(defaultValue = "") String title,
        @RequestParam(defaultValue = "") String description,
        @RequestParam(required = false) String takenAt,
        @RequestParam(required = false) String capturedAt,
        @RequestParam(defaultValue = "") String country,
        @RequestParam(defaultValue = "") String city,
        @RequestParam(required = false) Double latitude,
        @RequestParam(required = false) Double longitude,
        @RequestParam(defaultValue = "PUBLIC") String visibility) throws IOException {
        catalog.requireAlbum(albumId);
        validateLocation(latitude, longitude);
        String date = validateDate(takenAt);
        String captured = validateCapturedAt(capturedAt);
        if (captured != null) date = captured.substring(0, 10);
        String access = validateVisibility(visibility);
        Integer publicAlbum = jdbc.queryForObject("SELECT is_public FROM albums WHERE id=?", Integer.class, albumId);
        if (publicAlbum == null || publicAlbum == 0) access = "PRIVATE";
        PhotoStorage.Stored stored = storage.store(file);
        try {
            var metadata = stored.metadata();
            if (date == null) { date = metadata.takenAt(); captured = metadata.capturedAt(); }
            if (latitude == null && longitude == null) {
                latitude = metadata.latitude();
                longitude = metadata.longitude();
            }
            if (country.isBlank()) country = metadata.country();
            if (city.isBlank()) city = metadata.city();
            Integer order = jdbc.queryForObject("SELECT COALESCE(MAX(sort_order),-1)+1 FROM photos WHERE album_id=?", Integer.class, albumId);
            jdbc.update("INSERT INTO photos(album_id,stored_name,mime_type,title,description,taken_at,country,city,latitude,longitude,visibility,sort_order,captured_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                albumId, stored.name(), stored.mimeType(), clean(title, 120), clean(description, 4000), date,
                clean(country, 80), clean(city, 80), latitude, longitude, access, order, captured);
            Long id = jdbc.queryForObject("SELECT id FROM photos WHERE stored_name=?", Long.class, stored.name());
            return Map.of("id", id);
        } catch (RuntimeException ex) {
            storage.delete(stored.name(), stored.mimeType());
            throw ex;
        }
    }

    @PutMapping("/photos/{id}")
    public Object updatePhoto(@PathVariable long id, @RequestBody PhotoInput input) {
        CatalogService.PhotoRow existing = catalog.requirePhoto(id);
        validateLocation(input.latitude(), input.longitude());
        String visibility = validateVisibility(input.visibility());
        if (!existing.albumPublic()) visibility = "PRIVATE";
        String captured = validateCapturedAt(input.capturedAt());
        jdbc.update("UPDATE photos SET title=?,description=?,taken_at=?,country=?,city=?,latitude=?,longitude=?,visibility=?,captured_at=? WHERE id=?",
            clean(input.title(), 120), clean(input.description(), 4000), captured == null ? validateDate(input.takenAt()) : captured.substring(0, 10),
            clean(input.country(), 80), clean(input.city(), 80), input.latitude(), input.longitude(), visibility, captured, id);
        return Map.of("ok", true);
    }

    @DeleteMapping("/photos/{id}")
    public Object deletePhoto(@PathVariable long id) {
        CatalogService.PhotoRow photo = catalog.requirePhoto(id);
        jdbc.update("DELETE FROM photos WHERE id=?", id);
        storage.delete(photo.storedName(), photo.mimeType());
        return Map.of("ok", true);
    }

    @PutMapping("/photos/reorder")
    @Transactional
    public Object reorder(@RequestBody ReorderInput input) {
        catalog.requireAlbum(input.albumId());
        List<Long> existing = jdbc.query("SELECT id FROM photos WHERE album_id=? ORDER BY sort_order,id",
            (rs, row) -> rs.getLong(1), input.albumId());
        if (input.photoIds() == null || input.photoIds().size() != existing.size() ||
            !new java.util.HashSet<>(input.photoIds()).equals(new java.util.HashSet<>(existing))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "排序列表必须包含该相册的全部照片");
        }
        for (int i = 0; i < input.photoIds().size(); i++)
            jdbc.update("UPDATE photos SET sort_order=? WHERE id=?", i, input.photoIds().get(i));
        return Map.of("ok", true);
    }

    @GetMapping("/albums/{id}/access")
    public Object access(@PathVariable long id) {
        catalog.requireAlbum(id);
        return jdbc.queryForList("SELECT u.id,u.email FROM album_grants g JOIN users u ON u.id=g.user_id WHERE g.album_id=? ORDER BY u.email", id);
    }

    @DeleteMapping("/albums/{albumId}/access/{userId}")
    public Object revoke(@PathVariable long albumId, @PathVariable long userId) {
        jdbc.update("DELETE FROM album_grants WHERE album_id=? AND user_id=?", albumId, userId);
        return Map.of("ok", true);
    }

    @PostMapping("/albums/{id}/invitations")
    public Object invite(@PathVariable long id, @RequestBody InviteInput input) {
        catalog.requireAlbum(id);
        String email = required(input.email(), "邮箱", 254).toLowerCase();
        if (!email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "邮箱格式不正确");
        List<Long> users = jdbc.query("SELECT id FROM users WHERE email=?", (rs, row) -> rs.getLong(1), email);
        if (!users.isEmpty()) {
            jdbc.update("INSERT OR IGNORE INTO album_grants(album_id,user_id) VALUES(?,?)", id, users.getFirst());
            return Map.of("granted", true, "email", email);
        }
        byte[] bytes = new byte[32]; random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        String hash = hash(token);
        String expiry = Instant.now().plus(7, ChronoUnit.DAYS).toString();
        jdbc.update("INSERT INTO invitations(album_id,email,token_hash,expires_at) VALUES(?,?,?,?)", id, email, hash, expiry);
        return Map.of("granted", false, "token", token, "expiresAt", expiry, "email", email);
    }

    static String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (Exception ex) { throw new IllegalStateException(ex); }
    }

    static String clean(String value, int max) {
        if (value == null) return "";
        String text = value.strip();
        if (text.length() > max) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "文字过长");
        return text;
    }

    static String required(String value, String label, int max) {
        String text = clean(value, max);
        if (text.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, label + "不能为空");
        return text;
    }

    static String validateDate(String date) {
        if (date == null || date.isBlank()) return null;
        try { return LocalDate.parse(date).toString(); }
        catch (Exception ex) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "日期格式不正确"); }
    }

    static String validateCapturedAt(String value) {
        if (value == null || value.isBlank()) return null;
        try { return java.time.LocalDateTime.parse(value).toString(); }
        catch (Exception ex) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "拍摄时间格式不正确"); }
    }

    static String validateVisibility(String value) {
        if (!"PUBLIC".equals(value) && !"PRIVATE".equals(value))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "可见范围不正确");
        return value;
    }

    static void validateLocation(Double latitude, Double longitude) {
        if ((latitude == null) != (longitude == null))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请同时填写纬度和经度");
        if (latitude != null && (!Double.isFinite(latitude) || latitude < -90 || latitude > 90 ||
            !Double.isFinite(longitude) || longitude < -180 || longitude > 180))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "坐标超出范围");
    }
}
