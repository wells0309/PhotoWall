package com.photowall;

import com.drew.imaging.ImageMetadataReader;
import com.drew.metadata.exif.ExifIFD0Directory;
import com.drew.metadata.exif.ExifSubIFDDirectory;
import com.drew.metadata.exif.GpsDirectory;
import com.drew.metadata.iptc.IptcDirectory;
import com.drew.metadata.xmp.XmpDirectory;
import java.io.InputStream;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import org.springframework.stereotype.Service;

@Service
public class PhotoMetadata {
    public record Info(int orientation, String takenAt, String capturedAt, String country, String city,
                       Double latitude, Double longitude, boolean approximatePlace) {}
    private final OfflinePlaces places;
    public PhotoMetadata(OfflinePlaces places) { this.places = places; }

    public Info read(InputStream input) {
        int orientation = 1;
        String date = null, captured = null, country = "", city = "";
        Double latitude = null, longitude = null;
        try {
            var metadata = ImageMetadataReader.readMetadata(input);
            var ifd = metadata.getFirstDirectoryOfType(ExifIFD0Directory.class);
            if (ifd != null) orientation = ifd.getInteger(ExifIFD0Directory.TAG_ORIENTATION) == null ? 1 : ifd.getInteger(ExifIFD0Directory.TAG_ORIENTATION);
            var sub = metadata.getFirstDirectoryOfType(ExifSubIFDDirectory.class);
            String raw = sub == null ? null : sub.getString(ExifSubIFDDirectory.TAG_DATETIME_ORIGINAL);
            if (raw == null && sub != null) raw = sub.getString(ExifSubIFDDirectory.TAG_DATETIME_DIGITIZED);
            if (raw == null && ifd != null) raw = ifd.getString(ExifIFD0Directory.TAG_DATETIME);
            var xmp = metadata.getFirstDirectoryOfType(XmpDirectory.class);
            if (xmp != null) {
                var props = xmp.getXmpProperties();
                if (raw == null) raw = props.getOrDefault("exif:DateTimeOriginal", props.get("xmp:CreateDate"));
                city = text(props.get("photoshop:City")); country = text(props.get("photoshop:Country"));
            }
            if (raw != null) {
                try {
                    if (raw.matches("\\d{4}:\\d{2}:\\d{2}.*")) raw = raw.substring(0, 10).replace(':', '-') + raw.substring(10);
                    date = LocalDate.parse(raw.substring(0, 10)).toString();
                    if (raw.length() >= 19) captured = LocalDateTime.parse(raw.substring(0, 19).replace(' ', 'T')).format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
                } catch (Exception ignored) { /* A malformed date does not discard GPS or place tags. */ }
            }
            var iptc = metadata.getFirstDirectoryOfType(IptcDirectory.class);
            if (iptc != null) {
                if (city.isBlank()) city = text(iptc.getString(IptcDirectory.TAG_CITY));
                if (country.isBlank()) country = text(iptc.getString(IptcDirectory.TAG_COUNTRY_OR_PRIMARY_LOCATION_NAME));
            }
            var gps = metadata.getFirstDirectoryOfType(GpsDirectory.class);
            var location = gps == null ? null : gps.getGeoLocation();
            if (location != null && Double.isFinite(location.getLatitude()) && Double.isFinite(location.getLongitude()) && Math.abs(location.getLatitude()) <= 90 && Math.abs(location.getLongitude()) <= 180) {
                latitude = location.getLatitude(); longitude = location.getLongitude();
            }
        } catch (Exception ignored) { /* No readable metadata is normal for screenshots and GIFs. */ }
        boolean approximate = false;
        if (city.isBlank() && country.isBlank()) {
            var place = places.nearest(latitude, longitude);
            city = place.city(); country = place.country(); approximate = !city.isBlank();
        }
        return new Info(orientation, date, captured, country, city, latitude, longitude, approximate);
    }

    private static String text(String value) { return value == null ? "" : value.strip().substring(0, Math.min(80, value.strip().length())); }
}
