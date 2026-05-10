package com.samhanair.logis.accounting.report;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 재무상태표 (Balance Sheet / B/S) 응답 DTO.
 *
 * <p>balanced 검증: |totalAssets - (totalLiabilities + totalEquity)| &lt; 0.01 이면 true.
 * 결산 분개 없는 상태에서는 당기순이익이 미처분이익잉여금(343) 계정에 자동 가산된다.
 *
 * @param asOfDate                  기준 일자
 * @param assets                    자산 계정 행 목록 (100 그룹, 잔액 양수만 포함)
 * @param totalAssets               총 자산
 * @param liabilities               부채 계정 행 목록 (200 그룹)
 * @param totalLiabilities          총 부채
 * @param equity                    자본 계정 행 목록 (300 그룹, 당기순이익 자동 가산)
 * @param totalEquity               총 자본
 * @param totalLiabilitiesAndEquity 부채 + 자본 합계
 * @param balanced                  자산 == 부채+자본 여부 (허용 오차 0.01)
 * @param generatedAt               보고서 생성 시각
 */
public record BalanceSheetResponse(
        LocalDate asOfDate,
        List<BalanceSheetLine> assets,
        BigDecimal totalAssets,
        List<BalanceSheetLine> liabilities,
        BigDecimal totalLiabilities,
        List<BalanceSheetLine> equity,
        BigDecimal totalEquity,
        BigDecimal totalLiabilitiesAndEquity,
        boolean balanced,
        LocalDateTime generatedAt
) {}
