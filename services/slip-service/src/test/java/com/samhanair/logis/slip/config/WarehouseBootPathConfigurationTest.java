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
    void production_템플릿은_환경별_UUID를_공급하지_않고_STRICT만_선언한다() throws IOException {
        String userData = Files.readString(
                repositoryRoot().resolve("infrastructure/terraform/templates/user_data.sh"));

        assertThat(userData)
                .contains("WAREHOUSE_MAPPING_MODE=STRICT")
                .doesNotContain("WAREHOUSE_UUID_HQ=")
                .doesNotContain("WAREHOUSE_UUID_HUBAL=")
                .doesNotContain("WAREHOUSE_UUID_ANSEONG=")
                .doesNotContain("WAREHOUSE_UUID_CHANGWON=");
    }

    @Test
    void production_기동은_slip_readiness와_권위_alias_준비를_완료조건으로_기다린다() throws IOException {
        String userData = Files.readString(
                repositoryRoot().resolve("infrastructure/terraform/templates/user_data.sh"));
        String compose = Files.readString(
                repositoryRoot().resolve("infrastructure/docker-compose.prod.yml"));
        String deploy = Files.readString(
                repositoryRoot().resolve("infrastructure/scripts/phase11-deploy.ps1"));

        assertThat(userData)
                .contains("up -d --pull always --wait")
                .contains("WAREHOUSE_MAPPING_MODE=STRICT");
        assertThat(compose)
                .contains("/actuator/health/readiness")
                .contains("slip-service:");
        assertThat(deploy)
                .contains("/admin/warehouses/imports/ecount")
                .contains("배포 실패")
                .contains("exit 1");
    }

    @Test
    void dev_seed는_명시적인_DEV_SUBSTITUTE와_코드기반_변수를_공급한다() throws IOException {
        String seed = Files.readString(
                repositoryRoot().resolve("infrastructure/env-templates/.env.dev-seed"));

        assertThat(seed)
                .contains("WAREHOUSE_MAPPING_MODE=DEV_SUBSTITUTE")
                .contains("WAREHOUSE_UUID_ECOUNT_00003=")
                .contains("WAREHOUSE_UUID_ECOUNT_2=")
                .contains("WAREHOUSE_UUID_ECOUNT_14=")
                .contains("WAREHOUSE_UUID_ECOUNT_1=");
    }

    @Test
    void dev_seed는_UUID가_권위_alias가_아닌_대체값임을_명시한다() throws IOException {
        String seed = Files.readString(
                repositoryRoot().resolve("infrastructure/env-templates/.env.dev-seed"));

        assertThat(seed)
                .contains("WAREHOUSE_MAPPING_MODE=DEV_SUBSTITUTE")
                .contains("consumer 대체값이며 staging alias 권위 원본이 아니다");
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
