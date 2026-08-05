package com.samhanair.logis.slip.estimate.revision.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * {@link EstimateRevision} factory 검증 + {@link EstimateSnapshot} Jackson round-trip 단위 테스트
 * (권한 재편 Phase 2.2 Task 1).
 *
 * <p>JSONB 컬럼에 저장될 스냅샷 DTO 가 헤더(LocalDate/UUID 포함)+라인 배열을 무손실 직렬화/
 * 역직렬화하는지, factory 가 필수 인자를 강제하는지 확인한다.
 */
class EstimateRevisionSnapshotTest {

    private final ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());

    @Test
    @DisplayName("EstimateSnapshot 은 헤더+라인 배열을 Jackson round-trip 무손실 직렬화한다")
    void snapshotJacksonRoundTrip() throws Exception {
        UUID partnerId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        EstimateSnapshot original = new EstimateSnapshot(
                "2026/05/29-3",
                LocalDate.of(2026, 5, 29),
                partnerId,
                "삼한물산",
                "123-45-67890",
                "서울시 강남구 1",
                LocalDate.of(2026, 6, 28),
                "긴급 견적",
                List.of(
                        new EstimateSnapshot.Line(productId, "펌프", "MX-100", "220V", 2,
                                new BigDecimal("15000.00"), new BigDecimal("30000.00"),
                                new BigDecimal("3000.00"), new BigDecimal("33000.00"), "라인메모"),
                        new EstimateSnapshot.Line(UUID.randomUUID(), "밸브", null, null, 5,
                                new BigDecimal("3000.00"), new BigDecimal("15000.00"),
                                new BigDecimal("1500.00"), new BigDecimal("16500.00"), null)));

        String json = objectMapper.writeValueAsString(original);
        EstimateSnapshot restored = objectMapper.readValue(json, EstimateSnapshot.class);

        assertThat(restored).isEqualTo(original);
        assertThat(restored.lines()).hasSize(2);
        assertThat(restored.estimateDate()).isEqualTo(LocalDate.of(2026, 5, 29));
        assertThat(restored.validUntil()).isEqualTo(LocalDate.of(2026, 6, 28));
        assertThat(restored.partnerId()).isEqualTo(partnerId);
        assertThat(restored.lines().get(0).lineTotal()).isEqualByComparingTo("33000.00");
        assertThat(restored.lines().get(0).supplyAmount()).isEqualByComparingTo("30000.00");
        assertThat(restored.lines().get(0).vatAmount()).isEqualByComparingTo("3000.00");
    }

    @Test
    @DisplayName("[R6-H3] 세트 계보 필드는 round-trip 보존되고, 계보 없는 구 JSON 은 null 로 역직렬화된다")
    void snapshotLineLineageRoundTripAndLegacyJsonBackwardCompat() throws Exception {
        UUID productId = UUID.randomUUID();
        EstimateSnapshot.Line headLine = new EstimateSnapshot.Line(productId, "실내기", "COMP-1", "220V", 1,
                new BigDecimal("300000.00"), new BigDecimal("300000.00"),
                new BigDecimal("30000.00"), new BigDecimal("330000.00"), null,
                Boolean.TRUE, "SET-809");

        String json = objectMapper.writeValueAsString(headLine);
        EstimateSnapshot.Line restored = objectMapper.readValue(json, EstimateSnapshot.Line.class);
        assertThat(restored.setHead()).isTrue();
        assertThat(restored.parentSetModel()).isEqualTo("SET-809");

        // 구 스냅샷 JSON(계보 필드 자체가 없음) — 기존 estimate_revisions 행 하위호환
        String legacyJson = """
                {"productId":"%s","productName":"펌프","quantity":2,"unitPrice":15000.00}
                """.formatted(productId);
        EstimateSnapshot.Line legacy = objectMapper.readValue(legacyJson, EstimateSnapshot.Line.class);
        assertThat(legacy.setHead()).isNull();
        assertThat(legacy.parentSetModel()).isNull();
    }

    @Test
    @DisplayName("S20 RED-B: provenance가 있는 JSONB와 없는 구 JSONB를 모두 역직렬화한다")
    void snapshotSpecificationSourceRoundTripAndLegacyJsonBackwardCompat() throws Exception {
        String currentJson = """
                {"productId":"%s","productName":"펌프","specification":"220V",
                 "specificationSource":"CATALOG","quantity":2,"unitPrice":15000.00}
                """.formatted(UUID.randomUUID());

        EstimateSnapshot.Line current = objectMapper.readValue(currentJson, EstimateSnapshot.Line.class);
        assertThat(current.specification()).isEqualTo("220V");
        assertThat(current.specificationSource()).isEqualTo("CATALOG");
        EstimateSnapshot.Line serializedAgain = objectMapper.readValue(
                objectMapper.writeValueAsString(current), EstimateSnapshot.Line.class);
        assertThat(serializedAgain.specification()).isEqualTo("220V");
        assertThat(serializedAgain.specificationSource()).isEqualTo("CATALOG");

        String legacyJson = """
                {"productId":"%s","productName":"펌프","specification":"직접입력",
                 "quantity":2,"unitPrice":15000.00}
                """.formatted(UUID.randomUUID());
        EstimateSnapshot.Line legacy = objectMapper.readValue(legacyJson, EstimateSnapshot.Line.class);
        assertThat(legacy.specification()).isEqualTo("직접입력");
        assertThat(legacy.specificationSource()).isNull();
    }

    @Test
    @DisplayName("EstimateRevision.of 는 RESTORE 스냅샷을 생성하고 source revision 을 보존한다")
    void factoryCreatesRestoreRevision() {
        UUID estimateId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        EstimateSnapshot snapshot = new EstimateSnapshot("2026/05/29-3", LocalDate.of(2026, 5, 29),
                null, "삼한물산", null, null, null, null, List.of());

        EstimateRevision revision = EstimateRevision.of(estimateId, 4, EstimateRevisionType.RESTORE,
                2, "2026/05/29-3", LocalDate.of(2026, 5, 29), snapshot, actorId, "홍길동", "#3366FF");

        assertThat(revision.getEstimateId()).isEqualTo(estimateId);
        assertThat(revision.getRevisionNo()).isEqualTo(4);
        assertThat(revision.getRevisionType()).isEqualTo(EstimateRevisionType.RESTORE);
        assertThat(revision.getSourceRevisionNo()).isEqualTo(2);
        assertThat(revision.getActorName()).isEqualTo("홍길동");
        assertThat(revision.getSnapshot()).isEqualTo(snapshot);
    }

    @Test
    @DisplayName("EstimateRevision.of 는 필수 인자(estimateId/revisionNo/revisionType/snapshot) 누락 시 거부한다")
    void factoryRejectsMissingRequiredArgs() {
        EstimateSnapshot snapshot = new EstimateSnapshot(null, null, null, null, null, null,
                null, null, List.of());
        UUID estimateId = UUID.randomUUID();

        assertThatThrownBy(() -> EstimateRevision.of(null, 1, EstimateRevisionType.CREATE, null,
                null, null, snapshot, null, null, null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> EstimateRevision.of(estimateId, null, EstimateRevisionType.CREATE,
                null, null, null, snapshot, null, null, null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> EstimateRevision.of(estimateId, 1, null, null,
                null, null, snapshot, null, null, null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> EstimateRevision.of(estimateId, 1, EstimateRevisionType.CREATE,
                null, null, null, null, null, null, null))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
