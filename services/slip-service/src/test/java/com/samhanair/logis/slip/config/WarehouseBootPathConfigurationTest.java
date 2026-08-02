package com.samhanair.logis.slip.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

/** 저장소가 안내하는 기본 개발 진입점이 창고 매핑 가드의 입력을 공급하는지 검증한다. */
class WarehouseBootPathConfigurationTest {

    @Test
    void README_기본_slip_bootRun은_local_프로파일로_기동한다() throws IOException {
        String readme = Files.readString(repositoryRoot().resolve("README.md"));

        assertThat(readme)
                .contains("./gradlew :services:slip-service:bootRun")
                .contains("--spring.profiles.active=local");
    }

    @Test
    void dev_seed는_slip_service_창고_UUID_네_개를_공급한다() throws IOException {
        String seed = Files.readString(
                repositoryRoot().resolve("infrastructure/env-templates/.env.dev-seed"));

        assertThat(seed)
                .contains("WAREHOUSE_UUID_HQ=")
                .contains("WAREHOUSE_UUID_HUBAL=")
                .contains("WAREHOUSE_UUID_ANSEONG=")
                .contains("WAREHOUSE_UUID_CHANGWON=");
    }

    private static Path repositoryRoot() {
        Path current = Path.of(System.getProperty("user.dir")).toAbsolutePath();
        while (current != null && !Files.exists(current.resolve("settings.gradle"))) {
            current = current.getParent();
        }
        if (current == null) {
            throw new IllegalStateException("repository root not found");
        }
        return current;
    }
}
