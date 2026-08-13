package com.samhanair.logis.inventory.web.dto;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import java.util.UUID;

/**
 * reserve / release 결과 응답 — 갱신된 잔량과 actor.
 *
 * <p>{@code alreadyReserved} 필드(Phase 2.6c 신규): 멱등 no-op 여부를 나타낸다.
 * {@code true} 이면 이미 동일한 (referenceType, referenceId, productId, RESERVE) 조합이
 * 기록되어 있어 실제 reservedQty 증가 없이 기존 잔량을 그대로 반환한 것이다.
 * {@code false} 이면 실제 예약 움직임(movement)이 발생한 것이다.
 *
 * <p>호출자(PartnerOrderConvertService)는 {@code alreadyReserved == true} 이면
 * 해당 라인을 보상 대상(reservedLines)에서 제외해야 한다 (double-release 방지).
 */
public record ReservationResponse(
        UUID productId,
        @JsonSerialize(using = OpaqueUuidSerializer.class)
        UUID warehouseId,
        int quantity,
        int availableQty,
        int reservedQty,
        String actorUserId,
        boolean alreadyReserved) {

    /**
     * 하위 호환 생성자 — alreadyReserved=false 기본값.
     * release 응답 및 기존 코드 경로에서 사용한다.
     */
    public ReservationResponse(UUID productId, UUID warehouseId, int quantity,
                               int availableQty, int reservedQty, String actorUserId) {
        this(productId, warehouseId, quantity, availableQty, reservedQty, actorUserId, false);
    }
}
