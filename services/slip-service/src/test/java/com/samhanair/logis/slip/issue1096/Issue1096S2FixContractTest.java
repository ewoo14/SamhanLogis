package com.samhanair.logis.slip.issue1096;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

/**
 * 이슈 #1096 S2의 양방향 RED 계약.
 *
 * <p>마이그레이션/시더/복원 경계가 다시 분리되어 부분 복원이나 재시드가 생기지 않도록
 * 실제 소스 파일을 계약으로 묶는다. 이 테스트는 수정 전 반드시 실패해야 한다.
 */
class Issue1096S2FixContractTest {

    @Test
    void redA_normalRestartCannotRecreateDeletedSeedGraph() throws Exception {
        String compose = read("infrastructure/docker-compose.local-all.yml");
        String env = read("infrastructure/env-templates/.env.dev-seed");
        String slipSeeder = read("services/slip-service/src/main/java/com/samhanair/logis/slip/seed/SlipSeeder.java");
        String estimateSeeder = read("services/slip-service/src/main/java/com/samhanair/logis/slip/seed/EstimateSeeder.java");
        String orderSeeder = read("services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/seed/PartnerOrderSeeder.java");
        String slipApplication = read("services/slip-service/src/main/resources/application.yml");

        assertThat(compose).contains("SAMHAN_PARTNER_ORDER_SEED_TEST_DATA: \"false\"");
        assertThat(env).contains("SAMHAN_SLIP_SEED_TEST_DATA=false");
        assertThat(env).contains("SAMHAN_PARTNER_ORDER_SEED_TEST_DATA=false");
        assertThat(env).contains("SAMHAN_FULL_SEED_TEST_DATA=false");
        assertThat(slipApplication).contains("full-seed-test-data");
    }

    @Test
    void redB_cleanupPreservesCanonicalLinesAndRestoresOrFailsLoudly() throws Exception {
        String migration = read("services/slip-service/src/main/resources/db/migration/V117__soft_delete_test_seed_documents.sql");
        String orderMigration = read("services/partner-order-service/src/main/resources/db/migration/V16__soft_delete_test_seed_orders.sql");
        String estimateRestore = read("services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/service/EstimateService.java");
        String orderRestore = read("services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderDeleteService.java");

        assertThat(migration).contains("total_supply = COALESCE");
        assertThat(migration).contains("deleted_at=(SELECT max(l.deleted_at)");
        assertThat(orderMigration).contains("deleted_at=(SELECT max(l.deleted_at)");
        assertThat(estimateRestore).contains("findAllIncludingDeletedByEstimateId");
        assertThat(estimateRestore).contains("restorableLines");
        assertThat(orderRestore).contains("findAllIncludingDeletedByPartnerOrderId");
        assertThat(orderRestore).contains("ErrorCode.CONFLICT");
        assertThat(estimateRestore).contains("QA797-");
        assertThat(estimateRestore).contains("비정본 QA 잔재 견적은 일반 복원할 수 없습니다");
        assertThat(estimateRestore).contains("mixedQaAndCanonical");
        assertThat(estimateRestore).contains("hasCanonicalLine");
    }

    @Test
    void s6_cleanupSelectsDocumentsBySeedLineProvenanceNotEstimateNumber() throws Exception {
        String migration = read("services/slip-service/src/main/resources/db/migration/V117__soft_delete_test_seed_documents.sql");

        assertThat(migration)
                .doesNotContain("2026/07/17-1", "2026/07/17-2", "2026/07/17-5", "2026/07/17-20")
                .doesNotContain("2026/07/27-1")
                .contains("l.product_id IN (SELECT id FROM _issue_1096_test_product_ids)")
                .contains("EXISTS (SELECT 1 FROM estimate_lines")
                .contains("deleted_by='issue-1096-test-seed-cleanup'");
    }

    @Test
    void s6_estimateListCarriesRestoreAvailabilityForDeletedRows() throws Exception {
        String response = read("services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/web/dto/EstimateResponse.java");

        assertThat(response).contains("Boolean restoreAvailable");
    }

    private static String read(String relative) throws Exception {
        Path path = Path.of(relative);
        if (!Files.exists(path)) {
            path = Path.of("..", "..", relative);
        }
        return Files.readString(path, StandardCharsets.UTF_8);
    }
}
