package com.photowall;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.UUID;
import javax.imageio.ImageIO;
import javax.imageio.ImageReadParam;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.ImageOutputStream;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PhotoStorage {
    private final Path dataDir;
    private final long quotaBytes;
    private final PhotoMetadata metadataReader;

    public PhotoStorage(Path dataDir, @Value("${photowall.photo-quota-bytes}") long quotaBytes, PhotoMetadata metadataReader) {
        this.dataDir = dataDir; this.quotaBytes = quotaBytes; this.metadataReader = metadataReader;
    }

    public record Stored(String name, String mimeType, PhotoMetadata.Info metadata) {}


    public synchronized Stored store(MultipartFile file) throws IOException {
        if (file.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请选择照片");
        if (file.getSize() > 25L * 1024 * 1024) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "照片不能超过 25MB");
        try (var files = Files.list(dataDir.resolve("originals"))) {
            long used = files.filter(Files::isRegularFile).mapToLong(path -> {
                try { return Files.size(path); } catch (IOException ex) { return 0; }
            }).sum();
            if (used + file.getSize() > quotaBytes) throw new ResponseStatusException(HttpStatus.INSUFFICIENT_STORAGE, "照片存储空间已满");
        }
        if (Files.getFileStore(dataDir).getUsableSpace() < file.getSize() + 2L * 1024 * 1024 * 1024)
            throw new ResponseStatusException(HttpStatus.INSUFFICIENT_STORAGE, "服务器剩余磁盘空间不足");

        String name = UUID.randomUUID().toString();
        Path temp = Files.createTempFile(dataDir.resolve("originals"), "upload-", ".tmp");
        Path original = null;
        Path display = dataDir.resolve("display").resolve(name + ".jpg");
        try {
            file.transferTo(temp);
            PhotoMetadata.Info metadata;
            try (var input = Files.newInputStream(temp)) { metadata = metadataReader.read(input); }
            String mime;
            try (ImageInputStream stream = ImageIO.createImageInputStream(temp.toFile())) {
                if (stream == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "无法读取照片");
                var readers = ImageIO.getImageReaders(stream);
                if (!readers.hasNext()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "仅支持 JPEG、PNG 和 GIF");
                ImageReader reader = readers.next();
                try {
                    reader.setInput(stream, true, true);
                    String format = reader.getFormatName().toUpperCase();
                    if (!format.equals("JPEG") && !format.equals("JPG") && !format.equals("PNG") && !format.equals("GIF"))
                        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "仅支持 JPEG、PNG 和 GIF");
                    mime = format.equals("GIF") ? "image/gif" : format.equals("PNG") ? "image/png" : "image/jpeg";
                    if (mime.equals("image/gif")) display = dataDir.resolve("display").resolve(name + ".gif");
                    int width = reader.getWidth(0), height = reader.getHeight(0);
                    if (width < 1 || height < 1 || (long) width * height > 60_000_000L)
                        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "照片尺寸超出范围");
                    int sample = Math.max(1, Math.max(width, height) / 2000);
                    ImageReadParam params = reader.getDefaultReadParam();
                    params.setSourceSubsampling(sample, sample, 0, 0);
                    BufferedImage decoded = reader.read(0, params);
                    if (mime.equals("image/gif")) {
                        try { GifDisplay.write(temp, display); }
                        catch (IOException ex) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage()); }
                    } else writeDisplay(orient(decoded, metadata.orientation()), display);
                } finally { reader.dispose(); }
            }
            original = dataDir.resolve("originals").resolve(name + extension(mime));
            Files.move(temp, original, StandardCopyOption.ATOMIC_MOVE);
            return new Stored(name, mime, metadata);
        } catch (Exception ex) {
            Files.deleteIfExists(temp);
            Files.deleteIfExists(display);
            if (original != null) Files.deleteIfExists(original);
            if (ex instanceof IOException io) throw io;
            if (ex instanceof RuntimeException runtime) throw runtime;
            throw new IOException(ex);
        }
    }

    private BufferedImage orient(BufferedImage source, int orientation) {
        if (orientation < 2 || orientation > 8) return source;
        int width = source.getWidth(), height = source.getHeight();
        boolean swapped = orientation >= 5;
        BufferedImage result = new BufferedImage(swapped ? height : width, swapped ? width : height, BufferedImage.TYPE_INT_ARGB);
        for (int y = 0; y < result.getHeight(); y++) {
            for (int x = 0; x < result.getWidth(); x++) {
                int sx = x, sy = y;
                switch (orientation) {
                    case 2 -> sx = width - 1 - x;
                    case 3 -> { sx = width - 1 - x; sy = height - 1 - y; }
                    case 4 -> sy = height - 1 - y;
                    case 5 -> { sx = y; sy = x; }
                    case 6 -> { sx = y; sy = height - 1 - x; }
                    case 7 -> { sx = width - 1 - y; sy = height - 1 - x; }
                    case 8 -> { sx = width - 1 - y; sy = x; }
                    default -> { }
                }
                result.setRGB(x, y, source.getRGB(sx, sy));
            }
        }
        return result;
    }

    private void writeDisplay(BufferedImage source, Path path) throws IOException {
        double scale = Math.min(1, 1600d / Math.max(source.getWidth(), source.getHeight()));
        int width = Math.max(1, (int) Math.round(source.getWidth() * scale));
        int height = Math.max(1, (int) Math.round(source.getHeight() * scale));
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = image.createGraphics();
        try {
            graphics.setColor(Color.WHITE);
            graphics.fillRect(0, 0, width, height);
            graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            graphics.drawImage(source, 0, 0, width, height, null);
        } finally { graphics.dispose(); }
        ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
        try (ImageOutputStream output = ImageIO.createImageOutputStream(path.toFile())) {
            writer.setOutput(output);
            ImageWriteParam params = writer.getDefaultWriteParam();
            params.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            params.setCompressionQuality(0.85f);
            writer.write(null, new javax.imageio.IIOImage(image, null, null), params);
        } finally { writer.dispose(); }
    }

    public void delete(String name, String mimeType) {
        if (!name.matches("[a-f0-9-]{36}")) return;
        try {
            Files.deleteIfExists(dataDir.resolve("display").resolve(name + (mimeType.equals("image/gif") ? ".gif" : ".jpg")));
            Files.deleteIfExists(dataDir.resolve("originals").resolve(name + extension(mimeType)));
        } catch (IOException ex) { throw new IllegalStateException("照片文件删除失败", ex); }
    }

    static String extension(String mime) { return mime.equals("image/gif") ? ".gif" : mime.equals("image/png") ? ".png" : ".jpg"; }
}
