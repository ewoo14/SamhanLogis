package com.samhanair.logis.accounting.web.dto;

import java.time.LocalDateTime;

/**
 * 입금자명 매핑 append-only 변경 이력 응답. UUID를 반환하지 않는다.
 *
 * <p>#810 적대검증 R1 (L4-H2) — 매핑 entityId 기준 <b>전 필드</b>(rawName/normalizedName/
 * partnerCode/사유) 행을 반환하며, 같은 mutation 의 행들이 {@code revisionNo} 를 공유해
 * FE 가 회차 단위로 묶어 표시할 수 있다.
 */
public record BankDepositorPartnerMappingHistoryResponse(
        String fieldName,
        String oldValue,
        String newValue,
        String actor,
        LocalDateTime changedAt,
        int revisionNo
) {
}
