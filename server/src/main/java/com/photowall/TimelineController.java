package com.photowall;

import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class TimelineController {
    private final JdbcTemplate jdbc;
    private final CatalogService catalog;
    public TimelineController(JdbcTemplate jdbc, CatalogService catalog) { this.jdbc = jdbc; this.catalog = catalog; }
    public record MonthNote(String month, String title, String body) {}

    @GetMapping("/api/timeline-notes")
    public List<MonthNote> notes(Authentication auth) {
        Set<String> visibleMonths = catalog.photos(auth, null).stream().map(CatalogService.Photo::takenAt)
            .filter(date -> date != null && date.length() >= 7).map(date -> date.substring(0, 7)).collect(Collectors.toSet());
        return jdbc.query("SELECT month,title,body FROM timeline_notes ORDER BY month",
            (rs, row) -> new MonthNote(rs.getString(1), rs.getString(2), rs.getString(3)))
            .stream().filter(note -> catalog.isAdmin(auth) || visibleMonths.contains(note.month())).toList();
    }

    @PutMapping("/api/admin/timeline-notes/{month}")
    public MonthNote save(@PathVariable String month, @RequestBody MonthNote input) {
        try {
            if (!month.matches("\\d{4}-\\d{2}")) throw new DateTimeParseException("Invalid month", month, 0);
            YearMonth.parse(month);
        } catch (DateTimeParseException ex) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "月份格式应为 YYYY-MM"); }
        String title = input.title() == null ? "" : input.title().trim();
        String body = input.body() == null ? "" : input.body().trim();
        if (title.length() > 80 || body.length() > 1000) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "标题最多 80 字，文案最多 1000 字");
        jdbc.update("INSERT INTO timeline_notes(month,title,body) VALUES(?,?,?) ON CONFLICT(month) DO UPDATE SET title=excluded.title,body=excluded.body", month, title, body);
        return new MonthNote(month, title, body);
    }
}
