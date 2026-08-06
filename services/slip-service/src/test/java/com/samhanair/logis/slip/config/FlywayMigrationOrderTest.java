package com.samhanair.logis.slip.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/** 배포 DB가 V100까지 전진한 상태에서도 신규 slip migration이 out-of-order가 되지 않도록 고정한다. */
class FlywayMigrationOrderTest {

    private static final Pattern VERSION = Pattern.compile("V(\\d+)__.*\\.sql");

    @Test
    void sourceWarehouseCodeMigration_isAfterV100() throws Exception {
        Path migrationDir = Path.of("src/main/resources/db/migration");
        var migrations = Files.list(migrationDir)
                .filter(path -> VERSION.matcher(path.getFileName().toString()).matches())
                .toList();

        Path sourceWarehouseMigration = migrations.stream()
                .filter(path -> path.getFileName().toString().contains("source_warehouse_code"))
                .findFirst()
                .orElseThrow();
        Matcher matcher = VERSION.matcher(sourceWarehouseMigration.getFileName().toString());
        assertThat(matcher.matches()).isTrue();
        assertThat(Integer.parseInt(matcher.group(1))).isGreaterThan(100);
        assertThat(migrations.stream().map(path -> path.getFileName().toString()))
                .doesNotContain("V62__preserve_source_warehouse_code.sql");
    }
}
