package com.samhanair.logis.slip.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * Slip 도메인 — Slice C (signature-slice-C) 인수자 전자서명 라이프사이클 검증.
 * Plan §1.3 라이프사이클 표 + 회귀 가드 (기존 라이프사이클 메서드 무변경).
 */
class SlipSignatureTest {

    private static final UUID SOURCE_WH = UUID.randomUUID();
    private static final UUID DEST_WH = UUID.randomUUID();
    private static final UUID PARTNER = UUID.randomUUID();
    private static final byte[] PNG = new byte[]{(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A};
    private static final String HASH = "a3f2b1c9d4e5f6a7b8c9d0e1f2a3b4c5a3f2b1c9d4e5f6a7b8c9d0e1f2a3b4c5";

    // ---------- happy path: INSPECTING / COMPLETED / SHIPPING 모두 서명 가능 ----------

    @Test
    void recordSignature_inInspecting_succeeds() {
        Slip slip = newOutboundUpTo(SlipStatus.INSPECTING);
        slip.recordSignature("김인수", PNG, HASH, SignatureChannel.MOBILE_CANVAS);

        assertThat(slip.isSigned()).isTrue();
        assertThat(slip.getSignerName()).isEqualTo("김인수");
        assertThat(slip.getSignaturePng()).isEqualTo(PNG);
        assertThat(slip.getSignatureHash()).isEqualTo(HASH);
        assertThat(slip.getSignatureChannel()).isEqualTo(SignatureChannel.MOBILE_CANVAS);
        assertThat(slip.getSignatureShareToken()).isNotBlank();
        assertThat(slip.getSignatureShareToken().length()).isEqualTo(64);
        assertThat(slip.getSignatureShareExpiresAt()).isNotNull();
        // Slip status 자체는 변경되지 않아야 함 (Q3 — 서명은 라이프사이클 직교 메타)
        assertThat(slip.getStatus()).isEqualTo(SlipStatus.INSPECTING);
    }

    @Test
    void recordSignature_inCompleted_succeeds_andStatusUnchanged() {
        Slip slip = newOutboundUpTo(SlipStatus.COMPLETED);
        slip.recordSignature("이수령", PNG, HASH, SignatureChannel.MOBILE_CANVAS);

        assertThat(slip.isSigned()).isTrue();
        assertThat(slip.getStatus()).isEqualTo(SlipStatus.COMPLETED);
    }

    @Test
    void recordSignature_inShipping_succeeds_andStatusUnchanged() {
        Slip slip = newOutboundUpTo(SlipStatus.SHIPPING);
        slip.recordSignature("박배송", PNG, HASH, SignatureChannel.MOBILE_CANVAS);

        assertThat(slip.isSigned()).isTrue();
        assertThat(slip.getStatus()).isEqualTo(SlipStatus.SHIPPING);
    }

    @Test
    void recordSignature_shareTokenExpiresAt_30DaysAfterSignedAt() {
        Slip slip = newOutboundUpTo(SlipStatus.COMPLETED);
        slip.recordSignature("김인수", PNG, HASH, SignatureChannel.MOBILE_CANVAS);

        long days = java.time.Duration.between(slip.getSignedAt(), slip.getSignatureShareExpiresAt())
                .toDays();
        assertThat(days).isEqualTo(30L);
    }

    @Test
    void recordSignature_calledTwice_regeneratesShareToken() {
        Slip slip = newOutboundUpTo(SlipStatus.INSPECTING);
        slip.recordSignature("김인수", PNG, HASH, SignatureChannel.MOBILE_CANVAS);
        String firstToken = slip.getSignatureShareToken();
        slip.recordSignature("이수령", PNG, HASH, SignatureChannel.MOBILE_CANVAS);
        String secondToken = slip.getSignatureShareToken();

        assertThat(secondToken).isNotEqualTo(firstToken);
        assertThat(slip.getSignerName()).isEqualTo("이수령");
    }

    // ---------- 단계 가드: PROCESSING/ACCEPTED/SAVED 등 서명 거부 ----------

    @Test
    void recordSignature_inDraft_throwsConflict() {
        Slip slip = newOutbound();
        assertThatThrownBy(() ->
                slip.recordSignature("김", PNG, HASH, SignatureChannel.MOBILE_CANVAS))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }

    @Test
    void recordSignature_inProcessing_throwsConflict() {
        Slip slip = newOutboundUpTo(SlipStatus.PROCESSING);
        assertThatThrownBy(() ->
                slip.recordSignature("김", PNG, HASH, SignatureChannel.MOBILE_CANVAS))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }

    @Test
    void recordSignature_inAccepted_throwsConflict() {
        Slip slip = newOutboundUpTo(SlipStatus.ACCEPTED);
        assertThatThrownBy(() ->
                slip.recordSignature("김", PNG, HASH, SignatureChannel.MOBILE_CANVAS))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }

    @Test
    void recordSignature_inDelivered_throwsConflict() {
        Slip slip = newOutboundUpTo(SlipStatus.DELIVERED);
        assertThatThrownBy(() ->
                slip.recordSignature("김", PNG, HASH, SignatureChannel.MOBILE_CANVAS))
                .isInstanceOf(BusinessException.class);
    }

    // ---------- 입력 검증: signerName/png/hash/channel ----------

    @Test
    void recordSignature_blankSignerName_throws() {
        Slip slip = newOutboundUpTo(SlipStatus.COMPLETED);
        assertThatThrownBy(() ->
                slip.recordSignature("  ", PNG, HASH, SignatureChannel.MOBILE_CANVAS))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void recordSignature_signerNameOver50_throws() {
        Slip slip = newOutboundUpTo(SlipStatus.COMPLETED);
        String longName = "x".repeat(51);
        assertThatThrownBy(() ->
                slip.recordSignature(longName, PNG, HASH, SignatureChannel.MOBILE_CANVAS))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void recordSignature_emptyPng_throws() {
        Slip slip = newOutboundUpTo(SlipStatus.COMPLETED);
        assertThatThrownBy(() ->
                slip.recordSignature("김", new byte[0], HASH, SignatureChannel.MOBILE_CANVAS))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void recordSignature_nullChannel_throws() {
        Slip slip = newOutboundUpTo(SlipStatus.COMPLETED);
        assertThatThrownBy(() ->
                slip.recordSignature("김", PNG, HASH, null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    // ---------- invalidateSignature ----------

    @Test
    void invalidateSignature_afterRecord_clearsAllFields() {
        Slip slip = newOutboundUpTo(SlipStatus.COMPLETED);
        slip.recordSignature("김인수", PNG, HASH, SignatureChannel.MOBILE_CANVAS);
        assertThat(slip.isSigned()).isTrue();

        slip.invalidateSignature("재서명 요청");

        assertThat(slip.isSigned()).isFalse();
        assertThat(slip.getSignerName()).isNull();
        assertThat(slip.getSignaturePng()).isNull();
        assertThat(slip.getSignatureHash()).isNull();
        assertThat(slip.getSignatureChannel()).isNull();
        assertThat(slip.getSignatureShareToken()).isNull();
        assertThat(slip.getSignatureShareExpiresAt()).isNull();
    }

    @Test
    void invalidateSignature_unsignedSlip_throwsConflict() {
        Slip slip = newOutboundUpTo(SlipStatus.COMPLETED);
        assertThatThrownBy(() -> slip.invalidateSignature("사유"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }

    @Test
    void invalidateSignature_blankReason_throws() {
        Slip slip = newOutboundUpTo(SlipStatus.COMPLETED);
        slip.recordSignature("김", PNG, HASH, SignatureChannel.MOBILE_CANVAS);
        assertThatThrownBy(() -> slip.invalidateSignature("  "))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void invalidateSignature_reasonOver500_throws() {
        Slip slip = newOutboundUpTo(SlipStatus.COMPLETED);
        slip.recordSignature("김", PNG, HASH, SignatureChannel.MOBILE_CANVAS);
        String longReason = "x".repeat(501);
        assertThatThrownBy(() -> slip.invalidateSignature(longReason))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void invalidateThenRecord_succeeds_recyclesLifecycle() {
        Slip slip = newOutboundUpTo(SlipStatus.COMPLETED);
        slip.recordSignature("김인수", PNG, HASH, SignatureChannel.MOBILE_CANVAS);
        slip.invalidateSignature("재서명 요청");
        slip.recordSignature("이수령", PNG, HASH, SignatureChannel.MOBILE_CANVAS);

        assertThat(slip.isSigned()).isTrue();
        assertThat(slip.getSignerName()).isEqualTo("이수령");
    }

    // ---------- isSignatureShareExpired ----------

    @Test
    void isSignatureShareExpired_unsignedSlip_returnsTrue() {
        Slip slip = newOutboundUpTo(SlipStatus.COMPLETED);
        assertThat(slip.isSignatureShareExpired()).isTrue();
    }

    @Test
    void isSignatureShareExpired_freshlySignedSlip_returnsFalse() {
        Slip slip = newOutboundUpTo(SlipStatus.COMPLETED);
        slip.recordSignature("김", PNG, HASH, SignatureChannel.MOBILE_CANVAS);
        assertThat(slip.isSignatureShareExpired()).isFalse();
    }

    // ---------- 회귀 가드: 기존 라이프사이클 메서드 영향 없음 ----------

    @Test
    void existingLifecycle_unaffectedBySignatureFields() {
        Slip slip = newOutbound();
        slip.save();
        slip.send();
        slip.accept("a");
        slip.process();
        slip.complete();
        slip.inspect("ins");

        // 기존 라이프사이클 정상 진행 — 서명 메타 모두 null 유지
        assertThat(slip.getStatus()).isEqualTo(SlipStatus.COMPLETED);
        assertThat(slip.isSigned()).isFalse();
    }

    // ---------- 헬퍼 ----------

    private Slip newOutbound() {
        return Slip.createOutbound("2026/05/05-001", LocalDate.of(2026, 5, 5), 1,
                SOURCE_WH, DEST_WH, PARTNER, "삼한공조",
                DeliveryTag.SALE, null, "user-1");
    }

    /** 출고전표를 지정 status 까지 도달시킨다. */
    private Slip newOutboundUpTo(SlipStatus target) {
        Slip slip = newOutbound();
        if (target == SlipStatus.DRAFT) {
            return slip;
        }
        slip.save();
        if (target == SlipStatus.SAVED) return slip;
        slip.send();
        if (target == SlipStatus.SENT) return slip;
        slip.accept("a");
        if (target == SlipStatus.ACCEPTED) return slip;
        slip.process();
        if (target == SlipStatus.PROCESSING) return slip;
        slip.complete();   // → INSPECTING
        if (target == SlipStatus.INSPECTING) return slip;
        slip.inspect("ins");  // → COMPLETED
        if (target == SlipStatus.COMPLETED) return slip;
        slip.ship();
        if (target == SlipStatus.SHIPPING) return slip;
        slip.deliver();
        if (target == SlipStatus.DELIVERED) return slip;
        slip.confirm();
        return slip;
    }
}
