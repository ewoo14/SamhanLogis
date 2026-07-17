package com.samhanair.logis.accounting.web.dto;

import java.util.List;

/**
 * 입금 조회 + 자동 매칭 결과 응답 DTO (SP-09-4).
 *
 * <p>UUID 비공개 원칙 적용: UUID 는 응답에 포함하지 않는다.
 * 매칭 결과 식별은 depositorName / amount / transactionDate 조합으로 충분.
 *
 * <p>#810 R3-CODEX (S1-M1) — {@code unavailableSkippedCount} / {@code unavailableDepositorNames}
 * additive 추가(계약 pin). 거래처 조회 일시 장애(UNAVAILABLE)로 매칭이 보류된 행을 "정상 미존재"
 * UNMATCHED 와 구분해 집계한다. 해당 행은 status=UNMATCHED 이며 unmatchedCount 에도 포함되고,
 * KFTC 경로는 거래를 생성하지 않으므로(유실 대상 없음) fetch-and-match 재실행 시 재시도된다.
 *
 * @param totalCount                조회된 입금 거래 전체 건수
 * @param matchedCount              거래처/세금계산서 자동 매칭 성공 건수
 * @param unmatchedCount            매칭 실패 건수 (수동 매칭 필요, 조회 장애 보류 행 포함)
 * @param unavailableSkippedCount   거래처 조회 일시 장애로 매칭을 보류한 건수 (재실행 시 재시도 대상)
 * @param unavailableDepositorNames unavailable 보류 근거 입금자명(중복 제거)
 * @param results                   단건 매칭 결과 리스트
 */
public record DepositMatchResponse(
        int totalCount,
        int matchedCount,
        int unmatchedCount,
        int unavailableSkippedCount,
        List<String> unavailableDepositorNames,
        List<DepositMatchResultDto> results
) {

    /** unavailable 집계 도입 이전 4-인자 호환 생성자. */
    public DepositMatchResponse(int totalCount, int matchedCount, int unmatchedCount,
                                List<DepositMatchResultDto> results) {
        this(totalCount, matchedCount, unmatchedCount, 0, List.of(), results);
    }
}
