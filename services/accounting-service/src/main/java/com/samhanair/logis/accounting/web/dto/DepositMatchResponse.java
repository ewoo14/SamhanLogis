package com.samhanair.logis.accounting.web.dto;

import java.util.List;

/**
 * 입금 조회 + 자동 매칭 결과 응답 DTO (SP-09-4).
 *
 * <p>UUID 비공개 원칙 적용: UUID 는 응답에 포함하지 않는다.
 * 매칭 결과 식별은 depositorName / amount / transactionDate 조합으로 충분.
 *
 * @param totalCount     조회된 입금 거래 전체 건수
 * @param matchedCount   거래처/세금계산서 자동 매칭 성공 건수
 * @param unmatchedCount 매칭 실패 건수 (수동 매칭 필요)
 * @param results        단건 매칭 결과 리스트
 */
public record DepositMatchResponse(
        int totalCount,
        int matchedCount,
        int unmatchedCount,
        List<DepositMatchResultDto> results
) {
}
