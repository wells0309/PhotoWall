package com.photowall;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/** Losslessly retain frames, delays, transparency and loop extensions; strip other metadata. */
final class GifDisplay {
    static void write(Path source, Path target) throws IOException {
        byte[] bytes = sanitize(Files.readAllBytes(source));
        Files.write(target, bytes);
    }
    static byte[] sanitize(byte[] bytes) throws IOException {
        var in = new ByteArrayInputStream(bytes);
        var out = new ByteArrayOutputStream();
        byte[] header = read(in, 13);
        String signature = new String(header, 0, 6, StandardCharsets.US_ASCII);
        if (!signature.equals("GIF87a") && !signature.equals("GIF89a")) throw new IOException("无效的 GIF 文件");
        dimensions(header, 6);
        out.write(header);
        palette(in, out, header[10]);
        int frames = 0; long pixels = 0;
        while (true) {
            int marker = in.read();
            if (marker == 0x3b) { if (frames == 0) throw new IOException("GIF 缺少画面"); out.write(marker); return out.toByteArray(); }
            if (marker == 0x2c) {
                byte[] descriptor = read(in, 9);
                pixels += dimensions(descriptor, 4);
                if (++frames > 1000 || pixels > 200_000_000L) throw new IOException("GIF 动画帧数或尺寸过大");
                out.write(marker); out.write(descriptor); palette(in, out, descriptor[8]);
                int code = in.read(); if (code < 2 || code > 8) throw new IOException("无效的 GIF 图像编码");
                out.write(code); blocks(in, out);
            } else if (marker == 0x21) {
                int label = in.read();
                var extension = new ByteArrayOutputStream();
                blocks(in, extension);
                byte[] data = extension.toByteArray();
                String app = data.length >= 12 ? new String(data, 1, 11, StandardCharsets.US_ASCII) : "";
                if (label == 0xf9 || (label == 0xff && (app.equals("NETSCAPE2.0") || app.equals("ANIMEXTS1.0")))) {
                    out.write(marker); out.write(label); out.write(data);
                }
            } else throw new IOException("GIF 文件不完整或格式错误");
        }
    }
    private static long dimensions(byte[] data, int offset) throws IOException {
        int w = (data[offset] & 255) | ((data[offset + 1] & 255) << 8);
        int h = (data[offset + 2] & 255) | ((data[offset + 3] & 255) << 8);
        if (w == 0 || h == 0 || (long) w * h > 60_000_000L) throw new IOException("GIF 尺寸超出范围");
        return (long) w * h;
    }
    private static void palette(ByteArrayInputStream in, ByteArrayOutputStream out, byte packed) throws IOException {
        if ((packed & 128) != 0) out.write(read(in, 3 * (1 << ((packed & 7) + 1))));
    }
    private static void blocks(ByteArrayInputStream in, ByteArrayOutputStream out) throws IOException {
        while (true) {
            int size = in.read(); if (size < 0) throw new IOException("GIF 文件不完整");
            out.write(size); if (size == 0) return;
            out.write(read(in, size));
        }
    }
    private static byte[] read(ByteArrayInputStream in, int length) throws IOException {
        byte[] data = in.readNBytes(length);
        if (data.length != length) throw new IOException("GIF 文件不完整");
        return data;
    }
}
