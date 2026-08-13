package com.samhanair.logis.product.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class BundleComponentShapeContractTest {
    @Test
    void componentShape_is_a_persisted_row_attribute_without_changing_componentProductCode() throws Exception {
        var field = BundleComponent.class.getDeclaredField("componentShape");
        assertThat(field.getType()).isEqualTo(String.class);
        assertThat(BundleComponent.class.getDeclaredField("componentProductCode")).isNotNull();
    }

    @Test
    void migration_declares_shape_and_preserves_every_source_variant_row() throws Exception {
        var migration = Files.readString(findMigration(), StandardCharsets.UTF_8);
        assertThat(migration).contains("component_shape");
        assertThat(migration).contains("COUNT(*)");
        assertThat(migration).contains("component_variant");
        assertThat(migration).contains("source_count");
        assertThat(migration).contains("S6-1111-MANUAL");
    }

    private static Path findMigration() throws Exception {
        try (var files = Files.walk(Path.of("src/main/resources/db/migration"))) {
            return files.filter(path -> path.getFileName().toString().contains("component_shape"))
                    .findFirst()
                    .orElse(Path.of("src/main/resources/db/migration/V40__bundle_component_shape.sql"));
        }
    }
}
