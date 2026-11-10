package com.photowall;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.mock.web.MockMultipartFile;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import javax.imageio.ImageIO;
import java.util.UUID;

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
    "photowall.data-dir=target/test-data",
    "photowall.admin.email=owner@example.test",
    "photowall.admin.password=long-test-password-123"
})
class PrivacyIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;

    @BeforeEach
    void resetCatalog() {
        jdbc.update("DELETE FROM timeline_notes");
        jdbc.update("DELETE FROM invitations");
        jdbc.update("DELETE FROM album_grants");
        jdbc.update("DELETE FROM photos");
        jdbc.update("DELETE FROM albums");
    }

    @Test
    void publicRequestsNeverExposePrivatePhotoMetadataOrMedia() throws Exception {
        jdbc.update("INSERT INTO albums(title,is_public) VALUES('Public album',1)");
        long publicAlbum = jdbc.queryForObject("SELECT MAX(id) FROM albums", Long.class);
        jdbc.update("INSERT INTO albums(title,is_public) VALUES('Private album',0)");
        long privateAlbum = jdbc.queryForObject("SELECT MAX(id) FROM albums", Long.class);
        jdbc.update("INSERT INTO photos(album_id,stored_name,mime_type,title,visibility) VALUES(?,?,?,'Visible photo','PUBLIC')",
            publicAlbum, UUID.randomUUID().toString(), "image/jpeg");
        jdbc.update("INSERT INTO photos(album_id,stored_name,mime_type,title,visibility) VALUES(?,?,?,'Hidden photo','PRIVATE')",
            publicAlbum, UUID.randomUUID().toString(), "image/jpeg");
        jdbc.update("INSERT INTO photos(album_id,stored_name,mime_type,title,visibility) VALUES(?,?,?,'Hidden album photo','PUBLIC')",
            privateAlbum, UUID.randomUUID().toString(), "image/jpeg");
        long hiddenId = jdbc.queryForObject("SELECT id FROM photos WHERE title='Hidden photo'", Long.class);

        String publicPhotos = mvc.perform(get("/api/photos")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(publicPhotos).contains("Visible photo").doesNotContain("Hidden photo", "Hidden album photo");
        mvc.perform(get("/api/media/{id}", hiddenId)).andExpect(status().isNotFound());
        mvc.perform(get("/api/admin/stats")).andExpect(status().isUnauthorized());

        String adminPhotos = mvc.perform(get("/api/photos").with(user("owner@example.test").roles("ADMIN")))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(adminPhotos).contains("Visible photo", "Hidden photo", "Hidden album photo");
    }

    @Test
    void districtSearchIsAdminOnlyAndSelectedDistrictPersistsOnUpload() throws Exception {
        mvc.perform(get("/api/admin/locations").param("query", "西湖区")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/locations").param("query", "西湖区").with(user("viewer").roles("VIEWER"))).andExpect(status().isForbidden());
        var results = mvc.perform(get("/api/admin/locations").param("query", "杭州 西湖区").with(user("owner@example.test").roles("ADMIN")))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        var place = json.readTree(results).get(0);
        assertThat(place.get("level").asText()).isEqualTo("district");
        jdbc.update("INSERT INTO albums(title,is_public) VALUES('Districts',1)");
        long album = jdbc.queryForObject("SELECT MAX(id) FROM albums", Long.class);
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(8, 8, BufferedImage.TYPE_INT_RGB), "jpg", bytes);
        mvc.perform(multipart("/api/admin/photos").file(new MockMultipartFile("file", "district.jpg", "image/jpeg", bytes.toByteArray()))
            .param("albumId", String.valueOf(album)).param("country", place.get("country").asText()).param("city", place.get("label").asText())
            .param("latitude", place.get("latitude").asText()).param("longitude", place.get("longitude").asText())
            .with(csrf()).with(user("owner@example.test").roles("ADMIN"))).andExpect(status().isOk());
        var saved = jdbc.queryForMap("SELECT city,latitude,longitude FROM photos WHERE album_id=?", album);
        assertThat(saved.get("city")).isEqualTo(place.get("label").asText());
        assertThat(((Number) saved.get("latitude")).doubleValue()).isEqualTo(place.get("latitude").asDouble());
        assertThat(((Number) saved.get("longitude")).doubleValue()).isEqualTo(place.get("longitude").asDouble());
    }

    @Test
    void initialAdministratorCanSignIn() throws Exception {
        mvc.perform(post("/api/auth/login").with(csrf())
            .param("username", "owner@example.test")
            .param("password", "long-test-password-123"))
            .andExpect(status().isOk());
    }

    @Test
    void monthlyNotesArePersistentAdminEditsAndRespectVisibleMonths() throws Exception {
        jdbc.update("INSERT INTO albums(title,is_public) VALUES('Timeline',1)");
        long albumId = jdbc.queryForObject("SELECT MAX(id) FROM albums", Long.class);
        jdbc.update("INSERT INTO photos(album_id,stored_name,mime_type,taken_at,visibility) VALUES(?,?,?,'2026-11-01','PUBLIC')", albumId, UUID.randomUUID().toString(), "image/jpeg");
        jdbc.update("INSERT INTO photos(album_id,stored_name,mime_type,taken_at,visibility) VALUES(?,?,?,'2026-10-01','PRIVATE')", albumId, UUID.randomUUID().toString(), "image/jpeg");
        String body = "{\"title\":\"November story\",\"body\":\"Shared memories\"}";
        mvc.perform(put("/api/admin/timeline-notes/2026-11").with(csrf()).contentType("application/json").content(body)).andExpect(status().isUnauthorized());
        mvc.perform(put("/api/admin/timeline-notes/2026-11").with(user("viewer").roles("VIEWER")).with(csrf()).contentType("application/json").content(body)).andExpect(status().isForbidden());
        mvc.perform(put("/api/admin/timeline-notes/2026-11").with(user("owner@example.test").roles("ADMIN")).with(csrf()).contentType("application/json").content(body)).andExpect(status().isOk());
        mvc.perform(put("/api/admin/timeline-notes/2026-10").with(user("owner@example.test").roles("ADMIN")).with(csrf()).contentType("application/json").content("{\"title\":\"Private month\",\"body\":\"Hidden memory\"}")).andExpect(status().isOk());
        String guest = mvc.perform(get("/api/timeline-notes")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(guest).contains("November story").doesNotContain("Private month", "Hidden memory");
        mvc.perform(put("/api/admin/timeline-notes/2026-11").with(user("owner@example.test").roles("ADMIN")).with(csrf()).contentType("application/json").content("{\"title\":\"Updated story\",\"body\":\"New text\"}")).andExpect(status().isOk());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM timeline_notes WHERE month='2026-11'", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT title FROM timeline_notes WHERE month='2026-11'", String.class)).isEqualTo("Updated story");
        mvc.perform(put("/api/admin/timeline-notes/2026-13").with(user("owner@example.test").roles("ADMIN")).with(csrf()).contentType("application/json").content(body)).andExpect(status().isBadRequest());
        String oversized = json.writeValueAsString(java.util.Map.of("title", "x".repeat(81), "body", "Text"));
        mvc.perform(put("/api/admin/timeline-notes/2026-11").with(user("owner@example.test").roles("ADMIN")).with(csrf()).contentType("application/json").content(oversized)).andExpect(status().isBadRequest());
    }

    @Test
    void uploadCreatesProtectedOriginalAndSwitchingToPrivateRevokesGuestAccess() throws Exception {
        jdbc.update("INSERT INTO albums(title,is_public) VALUES('Travel',1)");
        long albumId = jdbc.queryForObject("SELECT MAX(id) FROM albums", Long.class);
        BufferedImage image = new BufferedImage(16, 16, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        ImageIO.write(image, "jpg", bytes);
        MockMultipartFile file = new MockMultipartFile("file", "test.jpg", "image/jpeg", bytes.toByteArray());
        String response = mvc.perform(multipart("/api/admin/photos").file(file).with(user("owner@example.test").roles("ADMIN")).with(csrf())
            .param("albumId", String.valueOf(albumId)).param("title", "Lake photo")
            .param("visibility", "PUBLIC")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        long photoId = json.readTree(response).get("id").asLong();
        mvc.perform(get("/api/media/{id}", photoId)).andExpect(status().isOk());
        mvc.perform(get("/api/media/{id}", photoId).param("size", "original")).andExpect(status().isForbidden());
        mvc.perform(get("/api/media/{id}", photoId).param("size", "original").with(user("owner@example.test").roles("ADMIN"))).andExpect(status().isOk());
        mvc.perform(put("/api/admin/photos/{id}", photoId).with(user("owner@example.test").roles("ADMIN")).with(csrf())
            .contentType("application/json").content("{\"title\":\"Lake photo\",\"visibility\":\"PRIVATE\"}"))
            .andExpect(status().isOk());
        mvc.perform(get("/api/media/{id}", photoId)).andExpect(status().isNotFound());
    }

    @Test
    void metadataPreviewAndUploadReadPerPhotoTimeGpsAndOfflinePlace() throws Exception {
        byte[] image = getClass().getResourceAsStream("/photos/metadata.jpg").readAllBytes();
        var file = new MockMultipartFile("file", "camera.jpg", "image/jpeg", image);
        mvc.perform(multipart("/api/admin/photos/metadata").file(file).with(csrf())).andExpect(status().isUnauthorized());
        mvc.perform(multipart("/api/admin/photos/metadata").file(file).with(csrf()).with(user("viewer").roles("VIEWER"))).andExpect(status().isForbidden());
        String preview = mvc.perform(multipart("/api/admin/photos/metadata").file(file).with(csrf()).with(user("owner@example.test").roles("ADMIN")))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        var info = json.readTree(preview);
        assertThat(info.get("capturedAt").asText()).isEqualTo("2024-10-05T14:23:41");
        assertThat(info.get("latitude").asDouble()).isCloseTo(30.273889, org.assertj.core.data.Offset.offset(0.00001));
        assertThat(info.get("longitude").asDouble()).isCloseTo(120.155, org.assertj.core.data.Offset.offset(0.00001));
        assertThat(info.get("city").asText()).isNotBlank();
        assertThat(info.get("country").asText()).isEqualTo("中国");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM photos", Integer.class)).isZero();
        jdbc.update("INSERT INTO albums(title,is_public) VALUES('Metadata',1)");
        long album = jdbc.queryForObject("SELECT MAX(id) FROM albums", Long.class);
        mvc.perform(multipart("/api/admin/photos").file(file).param("albumId", String.valueOf(album)).with(csrf()).with(user("owner@example.test").roles("ADMIN"))).andExpect(status().isOk());
        assertThat(jdbc.queryForObject("SELECT captured_at FROM photos", String.class)).isEqualTo("2024-10-05T14:23:41");
        mvc.perform(multipart("/api/admin/photos").file(file).param("albumId", String.valueOf(album)).param("takenAt", "2020-01-01").param("capturedAt", "2020-01-01T10:00:00").param("city", "手动城市").param("latitude", "1").param("longitude", "2").with(csrf()).with(user("owner@example.test").roles("ADMIN"))).andExpect(status().isOk());
        var manual = jdbc.queryForMap("SELECT * FROM photos ORDER BY id DESC LIMIT 1");
        assertThat(manual.get("taken_at")).isEqualTo("2020-01-01");
        assertThat(manual.get("city")).isEqualTo("手动城市");
        assertThat(((Number) manual.get("latitude")).doubleValue()).isEqualTo(1);
    }

    @Test
    void gifRetainsFramesTimingAndLoopButStripsPrivateComments() throws Exception {
        jdbc.update("INSERT INTO albums(title,is_public) VALUES('Animation',1)");
        long album = jdbc.queryForObject("SELECT MAX(id) FROM albums", Long.class);
        byte[] gif = getClass().getResourceAsStream("/photos/animated.gif").readAllBytes();
        var file = new MockMultipartFile("file", "animation.gif", "image/gif", gif);
        String body = mvc.perform(multipart("/api/admin/photos").file(file).param("albumId", String.valueOf(album)).with(csrf()).with(user("owner@example.test").roles("ADMIN")))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        long id = json.readTree(body).get("id").asLong();
        var response = mvc.perform(get("/api/media/{id}", id)).andExpect(status().isOk()).andReturn().getResponse();
        assertThat(response.getContentType()).isEqualTo("image/gif");
        byte[] display = response.getContentAsByteArray();
        assertThat(new String(display, java.nio.charset.StandardCharsets.ISO_8859_1)).contains("NETSCAPE2.0").doesNotContain("private comment");
        try (var stream = ImageIO.createImageInputStream(new java.io.ByteArrayInputStream(display))) {
            var reader = ImageIO.getImageReaders(stream).next();
            try {
                reader.setInput(stream);
                assertThat(reader.getNumImages(true)).isEqualTo(2);
                assertThat(reader.read(0).getRGB(0,0)).isNotEqualTo(reader.read(1).getRGB(0,0));
                for (int i = 0; i < 2; i++) {
                    var tree = (org.w3c.dom.Element) reader.getImageMetadata(i).getAsTree("javax_imageio_gif_image_1.0");
                    var control = (org.w3c.dom.Element) tree.getElementsByTagName("GraphicControlExtension").item(0);
                    assertThat(control.getAttribute("delayTime")).isEqualTo(i == 0 ? "12" : "34");
                }
            } finally { reader.dispose(); }
        }
        mvc.perform(get("/api/media/{id}", id).param("size", "original")).andExpect(status().isForbidden());
        assertThat(org.assertj.core.api.Assertions.catchThrowable(() -> GifDisplay.sanitize(java.util.Arrays.copyOf(gif, gif.length - 4)))).isInstanceOf(java.io.IOException.class);
    }

    @Test
    void acceptedInvitationMakesPrivateAlbumVisibleToViewer() throws Exception {
        jdbc.update("INSERT INTO albums(title,is_public) VALUES('Family',0)");
        long albumId = jdbc.queryForObject("SELECT MAX(id) FROM albums", Long.class);
        jdbc.update("INSERT INTO photos(album_id,stored_name,mime_type,title,visibility) VALUES(?,?,?,'Family portrait','PRIVATE')",
            albumId, UUID.randomUUID().toString(), "image/jpeg");
        String email = "viewer-" + UUID.randomUUID() + "@example.test";
        String inviteResponse = mvc.perform(post("/api/admin/albums/{id}/invitations", albumId)
            .with(user("owner@example.test").roles("ADMIN")).with(csrf()).contentType("application/json")
            .content(json.writeValueAsString(java.util.Map.of("email", email))))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String token = json.readTree(inviteResponse).get("token").asText();
        mvc.perform(post("/api/invitations/accept").with(csrf()).contentType("application/json")
            .content(json.writeValueAsString(java.util.Map.of("token", token, "password", "viewer-password-123"))))
            .andExpect(status().isOk());
        String guestPhotos = mvc.perform(get("/api/photos")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(guestPhotos).doesNotContain("Family portrait");
        String viewerPhotos = mvc.perform(get("/api/photos").with(user(email).roles("VIEWER")))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(viewerPhotos).contains("Family portrait");
    }
}
