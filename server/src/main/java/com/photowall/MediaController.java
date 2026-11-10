package com.photowall;

import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/media")
public class MediaController {
    private final CatalogService catalog;
    private final Path dataDir;
    public MediaController(CatalogService catalog, Path dataDir) { this.catalog = catalog; this.dataDir = dataDir; }

    @GetMapping("/{id}")
    public ResponseEntity<FileSystemResource> media(@PathVariable long id,
        @RequestParam(defaultValue = "display") String size, Authentication auth) {
        CatalogService.PhotoRow photo = catalog.requirePhoto(id);
        if (!catalog.canSee(photo, auth)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        boolean original = size.equals("original");
        if (original && !catalog.isAdmin(auth)) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        if (!original && !size.equals("display")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        Path folder = dataDir.resolve(original ? "originals" : "display");
        boolean gif = photo.mimeType().equals("image/gif");
        Path file = folder.resolve(photo.storedName() + (original || gif ? PhotoStorage.extension(photo.mimeType()) : ".jpg")).normalize();
        if (!file.startsWith(folder) || !Files.isRegularFile(file)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(original || gif ? photo.mimeType() : "image/jpeg"))
            .cacheControl(CacheControl.noStore()).body(new FileSystemResource(file));
    }
}
