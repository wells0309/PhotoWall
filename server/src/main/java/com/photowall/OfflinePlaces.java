package com.photowall;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Service;

/** Offline nearest populated place, not an administrative boundary lookup. */
@Service
public class OfflinePlaces {
    private record City(String name, String code, double latitude, double longitude) {}
    public record Place(String country, String city) {}
    private final List<City> cities;

    public OfflinePlaces() throws Exception {
        try (var input = getClass().getResourceAsStream("/geodata/cities.tsv")) {
            if (input == null) throw new IllegalStateException("Missing offline city data");
            cities = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8)).lines().map(line -> {
                String[] f = line.split("\t");
                return new City(f[0], f[1], Double.parseDouble(f[2]), Double.parseDouble(f[3]));
            }).toList();
        }
    }

    public Place nearest(Double latitude, Double longitude) {
        if (latitude == null || longitude == null) return new Place("", "");
        City nearest = null;
        double best = Math.pow(Math.sin(50d / 6371 / 2), 2);
        double lat = Math.toRadians(latitude);
        for (City city : cities) {
            double dlat = Math.toRadians(city.latitude - latitude);
            double dlon = Math.toRadians(city.longitude - longitude);
            double a = Math.pow(Math.sin(dlat / 2), 2) + Math.cos(lat) * Math.cos(Math.toRadians(city.latitude)) * Math.pow(Math.sin(dlon / 2), 2);
            if (a < best) { best = a; nearest = city; }
        }
        return nearest == null ? new Place("", "") : new Place(new Locale.Builder().setRegion(nearest.code).build().getDisplayCountry(Locale.SIMPLIFIED_CHINESE), nearest.name);
    }
}
