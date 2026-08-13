package com.samhanair.logis.slip.publish;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipSourceType;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.web.dto.OpaqueUuidSerializer;
import java.util.UUID;

/**
 * Phase 6 M5 (slip-service-integration) — 발행 endpoint 의 표준 응답.
 *
 * <p>호출자가 즉시 화면 표시에 필요한 최소 정보 (slipNo, status, sourceType, sourceId).
 * 상세는 {@code GET /slips/{id}} 로 별도 조회하며, slipId는 JSON에서 URL-safe opaque token으로 직렬화한다.
 *
 * @param slipId 발행된 Slip UUID (JSON에서는 opaque token으로 직렬화되며 후속 조회/리다이렉트에 사용)
 * @param slipNo 채번된 전표번호 ({@code yyyy/MM/dd-N})
 * @param status 발행 직후 상태 (보통 {@link SlipStatus#DRAFT})
 * @param sourceType 발행 출처
 * @param sourceId 출처 비즈니스 식별자 (estimateNumber / partnerOrderId)
 * @param idempotencyKey 호출자가 보낸 키 그대로 echo (디버깅 + 감사 cross-check)
 * @param idempotentReplay true 면 본 응답이 기존 슬립을 재반환한 것 (200 OK), false 면 신규 발행 (201 Created)
 */
public record PublishSlipResponse(
        @JsonSerialize(using = OpaqueUuidSerializer.class)
        UUID slipId,
        String slipNo,
        SlipStatus status,
        SlipSourceType sourceType,
        String sourceId,
        String idempotencyKey,
        boolean idempotentReplay) {

    /** 신규 발행 (201 Created). */
    public static PublishSlipResponse created(Slip slip) {
        return new PublishSlipResponse(slip.getId(), slip.getSlipNo(), slip.getStatus(),
                slip.getSourceType(), slip.getSourceId(), slip.getIdempotencyKey(), false);
    }

    /** 멱등 재반환 (200 OK) — 같은 idempotencyKey + 같은 본문 두번째 호출. */
    public static PublishSlipResponse replay(Slip slip) {
        return new PublishSlipResponse(slip.getId(), slip.getSlipNo(), slip.getStatus(),
                slip.getSourceType(), slip.getSourceId(), slip.getIdempotencyKey(), true);
    }
}
