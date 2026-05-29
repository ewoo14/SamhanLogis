package com.samhanair.logis.slip.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.revision.domain.SlipSnapshot;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * {@link Slip#restoreFromSnapshot(SlipSnapshot)} 도메인 단위 테스트 (권한 재편 Phase 2.1 Task 3).
 *
 * <p>스냅샷 역적용 정확성 검증 — 헤더 필드 복원 + 라인 추가/삭제/수정이 스냅샷 기준으로 정확히
 * 반영되는지 + lockFlag=true 시 CONFLICT 거부.
 */
class SlipRestoreTest {

    private static final UUID SOURCE_WH = UUID.randomUUID();
    private static final UUID PARTNER = UUID.randomUUID();

    /**
     * 라인 2건 + memo "원본" 을 가진 출고 슬립을 생성한다 (복원 대상 기준 상태).
     */
    private Slip sampleSlip() {
        Slip slip = Slip.createOutbound("2026/05/29-1", LocalDate.of(2026, 5, 29), 1,
                SOURCE_WH, UUID.randomUUID(), PARTNER, "삼한물산",
                DeliveryTag.DAY, "원본", "user-1");
        slip.addLine(SlipLine.create(slip, UUID.randomUUID(), "펌프", "MX-100", "220V",
                2, new BigDecimal("15000.00"), "라인메모"));
        slip.addLine(SlipLine.create(slip, UUID.randomUUID(), "밸브", null, null,
                5, new BigDecimal("3000.00"), null));
        return slip;
    }

    private long activeLineCount(Slip slip) {
        return slip.getLines().stream()
                .filter(line -> !Boolean.TRUE.equals(line.getIsDeleted()))
                .count();
    }

    @Test
    @DisplayName("스냅샷의 헤더 필드를 그대로 역적용한다 (memo/거래처/deliveryTag/입금예정일)")
    void restoresHeaderFields() {
        Slip slip = sampleSlip();
        SlipSnapshot snapshot = new SlipSnapshot(
                "2026/05/29-1", LocalDate.of(2026, 5, 29),
                PARTNER, "복원거래처", "P-9999", "111-22-33333",
                "복원메모", DeliveryTag.REGION.name(),
                "복원배송지", "복원감리지", "복원프로젝트", "010-0000-0000",
                LocalDate.of(2026, 6, 30),
                UUID.randomUUID(), "복원창고",
                List.of());

        slip.restoreFromSnapshot(snapshot);

        assertThat(slip.getMemo()).isEqualTo("복원메모");
        assertThat(slip.getPartnerName()).isEqualTo("복원거래처");
        assertThat(slip.getPartnerCode()).isEqualTo("P-9999");
        assertThat(slip.getBusinessNumber()).isEqualTo("111-22-33333");
        assertThat(slip.getDeliveryTag()).isEqualTo(DeliveryTag.REGION);
        assertThat(slip.getDeliveryAddress()).isEqualTo("복원배송지");
        assertThat(slip.getSupervisionAddress()).isEqualTo("복원감리지");
        assertThat(slip.getProjectName()).isEqualTo("복원프로젝트");
        assertThat(slip.getRecipientPhone()).isEqualTo("010-0000-0000");
        assertThat(slip.getPaymentDueDate()).isEqualTo(LocalDate.of(2026, 6, 30));
        assertThat(slip.getDestinationWarehouseName()).isEqualTo("복원창고");
    }

    @Test
    @DisplayName("deliveryTag 스냅샷이 null 이면 null 로 복원한다 (null 안전)")
    void restoresNullDeliveryTag() {
        Slip slip = sampleSlip();
        SlipSnapshot snapshot = new SlipSnapshot(
                "2026/05/29-1", LocalDate.of(2026, 5, 29),
                PARTNER, "삼한물산", null, null,
                "메모", null, null, null, null, null, null, null, null,
                List.of());

        slip.restoreFromSnapshot(snapshot);

        assertThat(slip.getDeliveryTag()).isNull();
    }

    @Test
    @DisplayName("라인 삭제 — 스냅샷 라인이 1건이면 미삭제 라인은 1건으로 줄어든다")
    void restoreRemovesLines() {
        Slip slip = sampleSlip();
        assertThat(activeLineCount(slip)).isEqualTo(2);
        SlipSnapshot snapshot = new SlipSnapshot(
                "2026/05/29-1", LocalDate.of(2026, 5, 29),
                PARTNER, "삼한물산", null, null, "메모", null,
                null, null, null, null, null, null, null,
                List.of(new SlipSnapshot.Line(UUID.randomUUID(), "펌프", "MX-100", "220V",
                        2, new BigDecimal("15000.00"), new BigDecimal("30000.00"), "라인메모")));

        slip.restoreFromSnapshot(snapshot);

        assertThat(activeLineCount(slip)).isEqualTo(1);
        assertThat(slip.getLines().get(0).getProductName()).isEqualTo("펌프");
    }

    @Test
    @DisplayName("라인 추가 — 스냅샷 라인이 3건이면 미삭제 라인은 3건으로 늘어난다")
    void restoreAddsLines() {
        Slip slip = sampleSlip();
        SlipSnapshot snapshot = new SlipSnapshot(
                "2026/05/29-1", LocalDate.of(2026, 5, 29),
                PARTNER, "삼한물산", null, null, "메모", null,
                null, null, null, null, null, null, null,
                List.of(
                        new SlipSnapshot.Line(UUID.randomUUID(), "A", null, null,
                                1, new BigDecimal("100.00"), new BigDecimal("100.00"), null),
                        new SlipSnapshot.Line(UUID.randomUUID(), "B", null, null,
                                2, new BigDecimal("200.00"), new BigDecimal("400.00"), null),
                        new SlipSnapshot.Line(UUID.randomUUID(), "C", null, null,
                                3, new BigDecimal("300.00"), new BigDecimal("900.00"), null)));

        slip.restoreFromSnapshot(snapshot);

        assertThat(activeLineCount(slip)).isEqualTo(3);
        assertThat(slip.getLines()).extracting(SlipLine::getProductName)
                .containsExactly("A", "B", "C");
    }

    @Test
    @DisplayName("라인 수량 수정 — 스냅샷 quantity 로 복원되며 lineTotal 이 재계산된다")
    void restoreModifiesLineQuantity() {
        Slip slip = sampleSlip();
        SlipSnapshot snapshot = new SlipSnapshot(
                "2026/05/29-1", LocalDate.of(2026, 5, 29),
                PARTNER, "삼한물산", null, null, "메모", null,
                null, null, null, null, null, null, null,
                List.of(new SlipSnapshot.Line(UUID.randomUUID(), "펌프", "MX-100", "220V",
                        10, new BigDecimal("15000.00"), new BigDecimal("150000.00"), "라인메모")));

        slip.restoreFromSnapshot(snapshot);

        assertThat(activeLineCount(slip)).isEqualTo(1);
        SlipLine restored = slip.getLines().get(0);
        assertThat(restored.getQuantity()).isEqualTo(10);
        // SlipLine.create 가 lineTotal = quantity × unitPrice 로 재계산
        assertThat(restored.getLineTotal()).isEqualByComparingTo("150000.00");
    }

    @Test
    @DisplayName("lockFlag=true 슬립은 복원 시 CONFLICT 로 거부한다")
    void lockedSlip_restore_throwsConflict() {
        Slip slip = sampleSlip();
        slip.lock();
        SlipSnapshot snapshot = new SlipSnapshot(
                "2026/05/29-1", LocalDate.of(2026, 5, 29),
                PARTNER, "삼한물산", null, null, "메모", null,
                null, null, null, null, null, null, null, List.of());

        assertThatThrownBy(() -> slip.restoreFromSnapshot(snapshot))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.CONFLICT);
    }
}
