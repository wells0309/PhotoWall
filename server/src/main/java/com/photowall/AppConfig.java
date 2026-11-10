package com.photowall;

import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import javax.sql.DataSource;

@Configuration
public class AppConfig {
    @Bean
    public Path dataDir(@Value("${photowall.data-dir}") String configured) throws Exception {
        Path path = Path.of(configured).toAbsolutePath().normalize();
        Files.createDirectories(path);
        Files.createDirectories(path.resolve("originals"));
        Files.createDirectories(path.resolve("display"));
        return path;
    }

    @Bean
    public DataSource dataSource(Path dataDir) {
        DriverManagerDataSource source = new DriverManagerDataSource();
        source.setDriverClassName("org.sqlite.JDBC");
        source.setUrl("jdbc:sqlite:" + dataDir.resolve("photowall.sqlite"));
        return source;
    }
}
