package com.samhanair.logis.slip.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

/** 저장소가 안내하는 기본 개발 진입점이 창고 매핑 가드의 입력을 공급하는지 검증한다. */
class WarehouseBootPathConfigurationTest {

    @Test
    void README_기본_slip_bootRun은_local_프로파일을_강제하지_않고_PostgreSQL_기본설정을쓴다() throws IOException {
        String readme = Files.readString(repositoryRoot().resolve("README.md"));

        assertThat(readme)
                .contains("./gradlew :services:slip-service:bootRun")
                .doesNotContain(":slip-service:bootRun --args='--spring.profiles.active=local'")
                .contains("source infrastructure/env-templates/.env.dev-seed");

        String application = Files.readString(
                repositoryRoot().resolve("services/slip-service/src/main/resources/application.yml"));
        assertThat(application)
                .contains("url: jdbc:postgresql://${DB_HOST:localhost}:${DB_PORT:5432}/${DB_NAME:slip_db}")
                .contains("dialect: org.hibernate.dialect.PostgreSQLDialect")
                .contains("enabled: true");
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

    @Test
    void dev_seed는_업무창고가_없는_세_값을_기존전표보존용_fallback으로_명시한다() throws IOException {
        String seed = Files.readString(
                repositoryRoot().resolve("infrastructure/env-templates/.env.dev-seed"));

        assertThat(seed)
                .contains("업무 창고(HUBAL/ANSEONG/CHANGWON)를 만들지 않는다")
                .contains("기존 전표의 warehouse_id 참조를 보존")
                .contains("VH-001 1호차 차량재고 (fallback)")
                .contains("CS-001 거래처 위탁창고 (fallback)")
                .contains("VR-001 가상창고 (fallback)")
                .contains("기존 전표 1,428건");
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
