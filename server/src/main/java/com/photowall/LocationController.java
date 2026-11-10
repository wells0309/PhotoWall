package com.photowall;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class LocationController {
    private final LocationSearch locations;
    public LocationController(LocationSearch locations) { this.locations = locations; }

    @GetMapping("/api/admin/locations")
    public List<LocationSearch.Location> search(@RequestParam(defaultValue = "") String query) {
        return locations.search(query);
    }
}
