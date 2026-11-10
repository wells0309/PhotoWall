package com.photowall;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Service;

/** Offline place-name search. Coordinates are representative points, not camera GPS. */
@Service
public class LocationSearch {
    public record Location(String id, String country, String label, String name, String level, double latitude, double longitude) {}
    private record Entry(Location location, String name, String path, String searchable) {}
    private final List<Entry> entries = new ArrayList<>();

    public LocationSearch() throws Exception {
        try (var input = getClass().getResourceAsStream("/geodata/china-regions.tsv")) {
            if (input == null) throw new IllegalStateException("Missing offline region index");
            try (var reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
                for (String line; (line = reader.readLine()) != null;) {
                    String[] f = line.split("\t", -1);
                    add(new Location("geonames-" + f[0], "中国", f[3], f[4], f[2], Double.parseDouble(f[5]), Double.parseDouble(f[6])), f[7]);
                }
            }
        }
        try (var input = getClass().getResourceAsStream("/geodata/cities.tsv");
             var reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
            int index = 0;
            for (String line; (line = reader.readLine()) != null;) {
                String[] f = line.split("\t");
                if (f[1].equals("CN")) continue; // Region index provides qualified Chinese names.
                String country = new Locale.Builder().setRegion(f[1]).build().getDisplayCountry(Locale.SIMPLIFIED_CHINESE);
                add(new Location("city-" + index++, country, f[0], f[0], "city", Double.parseDouble(f[2]), Double.parseDouble(f[3])), "");
            }
        }
        // Preserve the Chinese names and reference points supported by the previous form.
        legacy("中国", "香港", 22.3193, 114.1694); legacy("中国", "台北", 25.033, 121.5654);
        legacy("日本", "东京", 35.6762, 139.6503); legacy("日本", "大阪", 34.6937, 135.5023);
        legacy("日本", "京都", 35.0116, 135.7681); legacy("韩国", "首尔", 37.5665, 126.978);
        legacy("新加坡", "新加坡", 1.3521, 103.8198); legacy("泰国", "曼谷", 13.7563, 100.5018);
        legacy("法国", "巴黎", 48.8566, 2.3522); legacy("英国", "伦敦", 51.5072, -0.1276);
        legacy("意大利", "罗马", 41.9028, 12.4964); legacy("捷克", "布拉格", 50.0755, 14.4378);
        legacy("希腊", "圣托里尼", 36.3932, 25.4615); legacy("瑞士", "因特拉肯", 46.6863, 7.8632);
        legacy("美国", "纽约", 40.7128, -74.006);
    }

    private void legacy(String country, String name, double latitude, double longitude) {
        add(new Location("legacy-" + name, country, name, name, "city", latitude, longitude), "");
    }

    private void add(Location location, String aliases) {
        if (!Double.isFinite(location.latitude) || !Double.isFinite(location.longitude)
                || Math.abs(location.latitude) > 90 || Math.abs(location.longitude) > 180) throw new IllegalArgumentException("Invalid region coordinate");
        entries.add(new Entry(location, normalize(location.name), normalize(location.label), normalize(location.country + location.label + aliases)));
    }

    public List<Location> search(String query) {
        if (query == null || query.isBlank() || query.length() > 80) return List.of();
        String[] terms = java.util.Arrays.stream(query.strip().split("[\\s/，,·]+"))
            .map(LocationSearch::normalize).filter(term -> !term.isEmpty()).toArray(String[]::new);
        if (terms.length == 0) return List.of();
        String whole = String.join("", terms);
        return entries.stream().filter(entry -> java.util.Arrays.stream(terms).allMatch(entry.searchable::contains))
            .sorted(Comparator.<Entry>comparingInt(entry -> entry.name.equals(whole) ? 0 : entry.path.equals(whole) ? 1 : entry.name.contains(whole) ? 2 : 3)
                .thenComparing(entry -> entry.location.level.equals("district") ? 0 : 1)
                .thenComparing(entry -> entry.location.label))
            .map(Entry::location).distinct().limit(20).toList();
    }

    private static String normalize(String value) {
        return Normalizer.normalize(value, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT)
            .replaceAll("特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|自治州|地区|省|市|区|县", "")
            .replaceAll("[\\s/，,·.'’_-]", "");
    }
}
