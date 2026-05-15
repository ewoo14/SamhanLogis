package com.samhanair.logis.arologis.web.dto.copy;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.samhanair.logis.arologis.service.copy.CopyFailureReason;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 사본 fail / skip / duplicate 시 JSON 응답 — Phase F (D-DF-07).
 *
 * <p>성공 (PNG 응답) 시는 image/png byte[] + X-* 헤더 사용 (본 DTO 미사용).
 * 본 DTO 는 Content-Type: application/json 분기 응답 전용.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record SignAndSendCopyResponse(
        UUID signatureId,
        boolean slipBridged,
        boolean copySent,
        LocalDateTime copySentAt,
        String copyRecipientPhoneMasked,
        CopyFailureReason copyFailureReason,
        String error,
        Boolean retryable,
        LocalDateTime previousCopySentAt
) {
    /** 사본 skip — 인수자 번호 없음 (D-DF-05). */
    public static SignAndSendCopyResponse phoneMissing(UUID signatureId) {
        return new SignAndSendCopyResponse(signatureId, true, false, null, null,
                CopyFailureReason.RECIPIENT_PHONE_MISSING, null, null, null);
    }

    /** 사본 합성/저장 fail (Tx2 c/d) — RENDERER_TIMEOUT/RENDERER_ERROR/STORAGE_FULL. */
    public static SignAndSendCopyResponse copyFailed(UUID signatureId, CopyFailureReason reason) {
        return new SignAndSendCopyResponse(signatureId, true, false, null, null, reason, null, null, null);
    }

    /** 409 — 이미 download 완료 (D-DF-04 1회 가드). */
    public static SignAndSendCopyResponse alreadySent(LocalDateTime previousCopySentAt) {
        return new SignAndSendCopyResponse(null, false, false, null, null, null,
                "COPY_ALREADY_SENT", null, previousCopySentAt);
    }

    /** 422 — Tx1 atomic fail (D-DF-01 양쪽 저장 보상 트랜잭션 실패). */
    public static SignAndSendCopyResponse bridgeFailed(String reason) {
        return new SignAndSendCopyResponse(null, false, false, null, null, null,
                "SIGNATURE_BRIDGE_FAILED:" + reason, true, null);
    }
}
