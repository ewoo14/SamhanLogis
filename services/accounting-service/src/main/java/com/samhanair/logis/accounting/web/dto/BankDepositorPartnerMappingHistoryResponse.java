package com.samhanair.logis.accounting.web.dto;

import java.time.LocalDateTime;

/**
 * 입금자명 매핑 append-only 변경 이력 응답. UUID를 반환하지 않는다.
 *
 * <p>#810 적대검증 R1 (L4-H2) — 매핑 entityId 기준 <b>전 필드</b>(rawName/normalizedName/
 * partnerCode/사유) 행을 반환하며, 같은 mutation 의 행들이 {@code revisionNo} 를 공유해
 * FE 가 회차 단위로 묶어 표시할 수 있다.
 *
 * <p>#810 R3-CODEX (S4-M3, 계약 pin) — {@code entryKey} 는 행마다 유일·안정(같은 행은 항상
 * 같은 값)한 <b>opaque 문자열</b>이다(SHA-256 hex 절단 — UUID 아님·역산 불가). FE 는 이를
 * React key 로 사용해 (revisionNo, fieldName) 동률 행의 key 충돌을 피한다. 정렬·식별 의미는
 * 없으며 표시 금지 대상도 아니다(사용자 노출 식별자는 여전히 fieldName/값/시각).
 */
public record BankDepositorPartnerMappingHistoryResponse(
        String entryKey,
        String fieldName,
        String oldValue,
        String newValue,
        String actor,
        LocalDateTime changedAt,
        int revisionNo
) {
}
