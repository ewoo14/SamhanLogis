package com.samhanair.logis.slip.revision.domain;

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
 * {@link SlipRevision} factory 검증 + {@link SlipSnapshot} Jackson round-trip 단위 테스트
 * (권한 재편 Phase 2.1 Task 1).
 *
 * <p>JSONB 컬럼에 저장될 스냅샷 DTO 가 헤더(LocalDate/UUID 포함)+라인 배열을 무손실 직렬화/
 * 역직렬화하는지, factory 가 필수 인자를 강제하는지 확인한다.
 */
class SlipRevisionSnapshotTest {

    private final ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());

    @Test
    @DisplayName("SlipSnapshot 은 헤더+라인 배열을 Jackson round-trip 무손실 직렬화한다")
    void snapshotJacksonRoundTrip() throws Exception {
        UUID partnerId = UUID.randomUUID();
        UUID warehouseId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        SlipSnapshot original = new SlipSnapshot(
                "2026/05/29-3",
                LocalDate.of(2026, 5, 29),
                partnerId,
                "삼한물산",
                "P-2026-0001",
                "123-45-67890",
                "긴급 출고",
                "OUTBOUND_DELIVERY",
                "서울시 강남구 1",
                "서울시 강남구 2",
                "강남 신축 프로젝트",
                "010-1234-5678",
                LocalDate.of(2026, 6, 30),
                warehouseId,
                "본사창고",
                // audit overlay 필드 10개 (PR #318 cycle1 P1-1)
                "배송지 주소", "검수지 주소", "010-9999-0000", "010-1111-2222",
                "거래처 사업장 주소", "김대표", "익월말", "5% 할인", "월말", "운송비 별도",
                List.of(
                        new SlipSnapshot.Line(productId, "펌프", "MX-100", "220V", 2,
                                new BigDecimal("15000.00"), new BigDecimal("30000.00"), "라인메모"),
                        new SlipSnapshot.Line(UUID.randomUUID(), "밸브", null, null, 5,
                                new BigDecimal("3000.00"), new BigDecimal("15000.00"), null)));

        String json = objectMapper.writeValueAsString(original);
        SlipSnapshot restored = objectMapper.readValue(json, SlipSnapshot.class);

        assertThat(restored).isEqualTo(original);
        assertThat(restored.lines()).hasSize(2);
        assertThat(restored.slipDate()).isEqualTo(LocalDate.of(2026, 5, 29));
        assertThat(restored.partnerId()).isEqualTo(partnerId);
        assertThat(restored.lines().get(0).lineTotal()).isEqualByComparingTo("30000.00");
    }

    @Test
    @DisplayName("SlipRevision.of 는 RESTORE 스냅샷을 생성하고 source revision 을 보존한다")
    void factoryCreatesRestoreRevision() {
        UUID slipId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        SlipSnapshot snapshot = new SlipSnapshot("2026/05/29-3", LocalDate.of(2026, 5, 29),
                null, "삼한물산", null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null,
                List.of());

        SlipRevision revision = SlipRevision.of(slipId, 4, SlipRevisionType.RESTORE, 2,
                "2026/05/29-3", LocalDate.of(2026, 5, 29), snapshot, actorId, "홍길동", "#3366FF");

        assertThat(revision.getSlipId()).isEqualTo(slipId);
        assertThat(revision.getRevisionNo()).isEqualTo(4);
        assertThat(revision.getRevisionType()).isEqualTo(SlipRevisionType.RESTORE);
        assertThat(revision.getSourceRevisionNo()).isEqualTo(2);
        assertThat(revision.getActorName()).isEqualTo("홍길동");
        assertThat(revision.getSnapshot()).isEqualTo(snapshot);
    }

    @Test
    @DisplayName("SlipRevision.of 는 필수 인자(slipId/revisionNo/revisionType/snapshot) 누락 시 거부한다")
    void factoryRejectsMissingRequiredArgs() {
        SlipSnapshot snapshot = new SlipSnapshot(null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, List.of());
        UUID slipId = UUID.randomUUID();

        assertThatThrownBy(() -> SlipRevision.of(null, 1, SlipRevisionType.CREATE, null,
                null, null, snapshot, null, null, null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> SlipRevision.of(slipId, null, SlipRevisionType.CREATE, null,
                null, null, snapshot, null, null, null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> SlipRevision.of(slipId, 1, null, null,
                null, null, snapshot, null, null, null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> SlipRevision.of(slipId, 1, SlipRevisionType.CREATE, null,
                null, null, null, null, null, null))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
