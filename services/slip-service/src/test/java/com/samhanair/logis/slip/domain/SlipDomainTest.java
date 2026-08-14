package com.samhanair.logis.slip.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Slip 도메인 — 상태 전이 가드 + 헤더 수정 가드 + 배송일정(applyDeliverySchedule) 검증. */
class SlipDomainTest {

    private static final UUID SOURCE_WH = UUID.randomUUID();
    private static final UUID DEST_WH = UUID.randomUUID();
    private static final UUID PARTNER = UUID.randomUUID();
    private static final UUID PRODUCT = UUID.randomUUID();

    @Test
    void createOutbound_setsDraft_andRequiresSourceWarehouse() {
        Slip slip = Slip.createOutbound("2026/05/04-1", LocalDate.of(2026, 5, 4), 1,
                SOURCE_WH, DEST_WH, PARTNER, "삼한공조",
                DeliveryTag.SALE, "메모", "user-1");

        assertThat(slip.getStatus()).isEqualTo(SlipStatus.DRAFT);
        assertThat(slip.getSlipType()).isEqualTo(SlipType.OUTBOUND);
        assertThat(slip.getSourceWarehouseId()).isEqualTo(SOURCE_WH);
        assertThat(slip.getDestinationWarehouseId()).isEqualTo(DEST_WH);
        assertThat(slip.isEditable()).isTrue();
    }

    @Test
    void createOutbound_nullSourceWarehouse_throws() {
        assertThatThrownBy(() -> Slip.createOutbound("X-001", LocalDate.now(), 1,
                null, DEST_WH, PARTNER, "p", DeliveryTag.SALE, null, "u"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT))
                .hasMessageContaining("출고 창고")
                .hasMessageNotContaining("sourceWarehouseId");
    }

    @Test
    void createInbound_setsSourceNull_andRequiresDestWarehouse() {
        Slip slip = Slip.createInbound("2026/05/04-1", LocalDate.of(2026, 5, 4), 1,
                DEST_WH, PARTNER, "삼한공조",
                DeliveryTag.RETURN, null, "user-1");

        assertThat(slip.getSourceWarehouseId()).isNull();
        assertThat(slip.getDestinationWarehouseId()).isEqualTo(DEST_WH);
        assertThat(slip.getSlipType()).isEqualTo(SlipType.INBOUND);
    }

    @Test
    void createInbound_withoutDeliveryTag_defaultsToPurchase() {
        Slip slip = Slip.createInbound("2026/05/04-2", LocalDate.of(2026, 5, 4), 2,
                DEST_WH, PARTNER, "삼한공조", null, null, "user-1");

        assertThat(slip.getDeliveryTag()).isEqualTo(DeliveryTag.PURCHASE);
    }

    @Test
    void inboundSend_capturesRevisionBaseline_andCountsOnlyAfterSent() {
        Slip slip = newInbound();
        slip.incrementRevision();
        slip.incrementRevision();

        assertThat(slip.getRevisionCount()).isEqualTo(2);
        assertThat(slip.getRevisionCountBaseline()).isNull();
        assertThat(slip.editHistoryCount()).isZero();

        slip.save();
        slip.send();

        assertThat(slip.getRevisionCountBaseline()).isEqualTo(2);
        assertThat(slip.editHistoryCount()).isZero();

        slip.incrementRevision();

        assertThat(slip.getRevisionCount()).isEqualTo(3);
        assertThat(slip.editHistoryCount()).isEqualTo(1);
    }

    @Test
    void outboundSend_doesNotCaptureBaseline_andInspectCountsOnlyAfterCompleted() {
        Slip slip = newOutbound();
        slip.incrementRevision();

        slip.save();
        slip.send();

        assertThat(slip.getRevisionCountBaseline()).isNull();
        assertThat(slip.editHistoryCount()).isZero();

        slip.accept("warehouse-1");
        slip.process();
        slip.complete();
        slip.inspect("inspector-1");

        assertThat(slip.getRevisionCountBaseline()).isEqualTo(1);
        assertThat(slip.editHistoryCount()).isZero();

        slip.incrementRevision();
        slip.incrementRevision();

        assertThat(slip.getRevisionCount()).isEqualTo(3);
        assertThat(slip.editHistoryCount()).isEqualTo(2);
    }

    @Test
    void revisionBaseline_isIdempotent_afterThresholdTransition() {
        Slip slip = newInbound();
        slip.incrementRevision();
        slip.save();
        slip.send();

        assertThat(slip.getRevisionCountBaseline()).isEqualTo(1);

        slip.incrementRevision();
        slip.accept("warehouse-1");
        slip.process();
        slip.complete();
        slip.inspect("inspector-1");

        assertThat(slip.getRevisionCount()).isEqualTo(2);
        assertThat(slip.getRevisionCountBaseline()).isEqualTo(1);
        assertThat(slip.editHistoryCount()).isEqualTo(1);
    }

    @Test
    void redlineAnchorRevisionNo_isCapturedOnce() {
        Slip slip = newInbound();

        assertThat(slip.getRedlineAnchorRevisionNo()).isNull();

        slip.captureRedlineAnchorIfAbsent(3);
        slip.captureRedlineAnchorIfAbsent(7);

        assertThat(slip.getRedlineAnchorRevisionNo()).isEqualTo(3);
    }

    @Test
    void createInbound_nullDestWarehouse_throws() {
        assertThatThrownBy(() -> Slip.createInbound("X", LocalDate.now(), 1,
                null, PARTNER, "p", DeliveryTag.RETURN, null, "u"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT))
                .hasMessageContaining("입고 창고")
                .hasMessageNotContaining("destinationWarehouseId");
    }

    @Test
    void createOutbound_inboundOnlyTag_throws() {
        assertThatThrownBy(() -> Slip.createOutbound("X", LocalDate.now(), 1,
                SOURCE_WH, DEST_WH, PARTNER, "p", DeliveryTag.RETURN, null, "u"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT))
                .hasMessageContaining("반품")
                .hasMessageContaining("출고")
                .hasMessageNotContaining("RETURN")
                .hasMessageNotContaining("OUTBOUND");
    }

    @Test
    void assignPublishSource_alreadyAssigned_throwsConflictWithDisplayName() {
        Slip slip = newOutbound();
        slip.assignPublishSource(SlipSourceType.ESTIMATE, "EST-001", "idem-1");

        assertThatThrownBy(() -> slip.assignPublishSource(
                        SlipSourceType.PARTNER_ORDER, "ORDER-001", "idem-2"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT))
                .hasMessageContaining("견적 자동 발행")
                .hasMessageNotContaining("ESTIMATE");
    }

    @Test
    void requireStatus_usesDisplayNameInConflictMessage() {
        Slip slip = newOutbound();

        assertThatThrownBy(slip::send)
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("저장완료")
                .hasMessageContaining("작성중")
                .hasMessageNotContaining("SAVED")
                .hasMessageNotContaining("DRAFT");
    }

    @Test
    void fullOutboundLifecycle_endsAtConfirmed() {
        Slip slip = newOutbound();
        slip.addLine(SlipLine.create(slip, PRODUCT, "에어컨", "M-1", null,
                5, new BigDecimal("100.00"), null));
        slip.save();
        slip.send();
        slip.accept("acc");
        slip.process();
        slip.complete();         // PROCESSING → INSPECTING (출고 완료)
        slip.inspect("insp-1");  // INSPECTING → COMPLETED (검수 완료)
        slip.ship();
        slip.deliver();
        slip.confirm();

        assertThat(slip.getStatus()).isEqualTo(SlipStatus.CONFIRMED);
        assertThat(slip.getConfirmedAt()).isNotNull();
        assertThat(slip.getCompletedAt()).isNotNull();
        assertThat(slip.getAcceptedAt()).isNotNull();
        assertThat(slip.getAcceptedBy()).isEqualTo("acc");
    }

    @Test
    void inboundLifecycle_skipsShipDeliver() {
        Slip slip = newInbound();
        slip.addLine(SlipLine.create(slip, PRODUCT, "p", null, null,
                1, new BigDecimal("10.00"), null));
        slip.save();
        slip.send();
        slip.accept("acc");
        slip.process();
        slip.complete();         // 출고 완료 → INSPECTING
        slip.inspect("insp-1");  // 검수 완료 → COMPLETED
        slip.confirm();

        assertThat(slip.getStatus()).isEqualTo(SlipStatus.CONFIRMED);
    }

    @Test
    void inboundShip_throwsConflict() {
        Slip slip = newInbound();
        slip.save();
        slip.send();
        slip.accept("a");
        slip.process();
        slip.complete();
        slip.inspect("insp");

        assertThatThrownBy(slip::ship)
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }

    @Test
    void send_fromDraft_throwsConflict() {
        Slip slip = newOutbound();
        assertThatThrownBy(slip::send)
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }

    @Test
    void editHeader_blockedAfterSent() {
        Slip slip = newOutbound();
        slip.save();
        slip.send();

        assertThatThrownBy(() -> slip.editHeader(null, "변경", null, null, null, null))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }

    @Test
    void editHeader_inDraft_appliesPartial() {
        Slip slip = newOutbound();
        slip.editHeader(null, "새거래처", DeliveryTag.STACK, "새메모", null, null);

        assertThat(slip.getPartnerName()).isEqualTo("새거래처");
        assertThat(slip.getDeliveryTag()).isEqualTo(DeliveryTag.STACK);
        assertThat(slip.getMemo()).isEqualTo("새메모");
    }

    @Test
    void cancel_fromAccepted_throwsConflict() {
        Slip slip = newOutbound();
        slip.save();
        slip.send();
        slip.accept("acc");

        assertThatThrownBy(slip::cancel)
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }

    @Test
    void cancel_fromSent_succeeds() {
        Slip slip = newOutbound();
        slip.save();
        slip.send();
        slip.cancel();

        assertThat(slip.getStatus()).isEqualTo(SlipStatus.CANCELED);
    }

    @Test
    void reject_fromSent_movesToRejected_andPrependsReason() {
        Slip slip = newOutbound();
        slip.editHeader(null, null, null, "원본메모", null, null);
        slip.save();
        slip.send();
        slip.reject("재고 부족");

        assertThat(slip.getStatus()).isEqualTo(SlipStatus.REJECTED);
        assertThat(slip.getMemo()).startsWith("[반려: 재고 부족]");
    }

    @Test
    void reject_fromDraft_throwsConflict() {
        Slip slip = newOutbound();
        assertThatThrownBy(() -> slip.reject("x"))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void slipLine_create_calculatesLineTotal() {
        Slip slip = newOutbound();
        SlipLine line = SlipLine.create(slip, PRODUCT, "에어컨", "M-1", "220V",
                3, new BigDecimal("1500.00"), null);

        assertThat(line.getLineTotal()).isEqualByComparingTo(new BigDecimal("4500.00"));
        assertThat(line.getSpecification()).isEqualTo("220V");
    }

    @Test
    void slipLine_changeQuantity_recalculatesLineTotal() {
        Slip slip = newOutbound();
        SlipLine line = SlipLine.create(slip, PRODUCT, "p", null, null,
                2, new BigDecimal("100.00"), null);
        line.changeQuantity(5);

        assertThat(line.getLineTotal()).isEqualByComparingTo(new BigDecimal("500.00"));
    }

    @Test
    void slipLine_changeSpecification_updatesValue() {
        Slip slip = newOutbound();
        SlipLine line = SlipLine.create(slip, PRODUCT, "p", null, "220V",
                1, new BigDecimal("100.00"), null);
        line.changeSpecification("4HP");

        assertThat(line.getSpecification()).isEqualTo("4HP");
    }

    @Test
    void slipLine_negativeUnitPrice_throws() {
        Slip slip = newOutbound();
        assertThatThrownBy(() -> SlipLine.create(slip, PRODUCT, "p", null, null,
                1, new BigDecimal("-1.00"), null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void slipLine_zeroQuantity_throws() {
        Slip slip = newOutbound();
        assertThatThrownBy(() -> SlipLine.create(slip, PRODUCT, "p", null, null,
                0, new BigDecimal("100.00"), null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void slipNumberSequence_next_increments() {
        SlipNumberSequence seq = SlipNumberSequence.create(LocalDate.of(2026, 5, 4));
        assertThat(seq.next()).isEqualTo(1);
        assertThat(seq.next()).isEqualTo(2);
        assertThat(seq.next()).isEqualTo(3);
        assertThat(seq.getLastSeq()).isEqualTo(3);
    }

    // -------- Slice A (sales-polish-2) — INSPECTING + 자동 서명 --------

    @Test
    void accept_setsDispatcherUserIdAndSignedAt() {
        Slip slip = newOutbound();
        slip.save();
        slip.send();
        slip.accept("warehouse-1");

        assertThat(slip.getStatus()).isEqualTo(SlipStatus.ACCEPTED);
        assertThat(slip.getDispatcherUserId()).isEqualTo("warehouse-1");
        assertThat(slip.getDispatcherSignedAt()).isNotNull();
        assertThat(slip.getDispatcherSignedAt()).isEqualTo(slip.getAcceptedAt());
    }

    @Test
    void inspectFromProcessing_throwsConflict_inspectingRequired() {
        // Slice A hotfix: PROCESSING 에서 inspect 시도 → CONFLICT (검수 완료는 INSPECTING 필요).
        Slip slip = newOutbound();
        slip.save();
        slip.send();
        slip.accept("acc");
        slip.process();

        assertThatThrownBy(() -> slip.inspect("insp"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }

    @Test
    void completeFromProcessing_movesToInspecting() {
        // Slice A hotfix: complete (출고 완료) = PROCESSING → INSPECTING.
        Slip slip = newOutbound();
        slip.save();
        slip.send();
        slip.accept("warehouse-1");
        slip.process();
        slip.complete();

        assertThat(slip.getStatus()).isEqualTo(SlipStatus.INSPECTING);
    }

    @Test
    void completeFromAccepted_throwsConflict() {
        Slip slip = newOutbound();
        slip.save();
        slip.send();
        slip.accept("a");
        // ACCEPTED 에서 complete 시도 → CONFLICT (PROCESSING 필요).
        assertThatThrownBy(slip::complete)
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }

    @Test
    void inspectFromInspecting_movesToCompleted_setsInspectorAndCompletedAt() {
        // Slice A hotfix: inspect (검수 완료) = INSPECTING → COMPLETED + inspector + completedAt.
        Slip slip = newOutbound();
        slip.save();
        slip.send();
        slip.accept("a");
        slip.process();
        slip.complete();
        slip.inspect("inspector-1");

        assertThat(slip.getStatus()).isEqualTo(SlipStatus.COMPLETED);
        assertThat(slip.getCompletedAt()).isNotNull();
        assertThat(slip.getInspectorUserId()).isEqualTo("inspector-1");
        assertThat(slip.getInspectorSignedAt()).isNotNull();
    }

    @Test
    void rejectFromInspecting_movesToRejected_andPrependsReason() {
        Slip slip = newOutbound();
        slip.editHeader(null, null, null, "원본", null, null);
        slip.save();
        slip.send();
        slip.accept("a");
        slip.process();
        slip.complete();  // PROCESSING → INSPECTING
        // Slice A: INSPECTING 단계에서 검수자 거부 가능.
        slip.reject("외관 불량");

        assertThat(slip.getStatus()).isEqualTo(SlipStatus.REJECTED);
        assertThat(slip.getMemo()).startsWith("[반려: 외관 불량]");
    }

    @Test
    void cancelFromInspecting_throwsConflict() {
        Slip slip = newOutbound();
        slip.save();
        slip.send();
        slip.accept("a");
        slip.process();
        slip.complete();  // PROCESSING → INSPECTING
        // INSPECTING 에서 cancel 거부 — ACCEPTED 부터 cancel 차단 정책 그대로.
        assertThatThrownBy(slip::cancel)
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }

    private Slip newOutbound() {
        return Slip.createOutbound("2026/05/04-1", LocalDate.of(2026, 5, 4), 1,
                SOURCE_WH, DEST_WH, PARTNER, "삼한공조",
                DeliveryTag.SALE, null, "user-1");
    }

    private Slip newInbound() {
        return Slip.createInbound("2026/05/04-1", LocalDate.of(2026, 5, 4), 1,
                DEST_WH, PARTNER, "삼한공조",
                DeliveryTag.RETURN, null, "user-1");
    }
}
