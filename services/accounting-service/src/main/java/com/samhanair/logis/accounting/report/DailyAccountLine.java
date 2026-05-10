package com.samhanair.logis.accounting.report;

import java.math.BigDecimal;

/**
 * 일계표 / 월계표 계정별 차/대/잔액 행 (REPORTS-C-DESIGN.md §9 Props spec 일치).
 *
 * <p>spec 필드명:
 * <ul>
 *   <li>{@code accountCode}  — 계정 코드</li>
 *   <li>{@code accountName}  — 계정명</li>
 *   <li>{@code debit}        — 차변 합계</li>
 *   <li>{@code credit}       — 대변 합계</li>
 *   <li>{@code balance}      — 잔액 (자산/비용: debit - credit; 부채/자본/수익: credit - debit)</li>
 *   <li>{@code sortOrder}    — UI 정렬 순서 (ChartOfAccount.displayOrder 기준)</li>
 * </ul>
 *
 * @param accountCode 계정 코드
 * @param accountName 계정명
 * @param debit       차변 합계
 * @param credit      대변 합계
 * @param balance     잔액 (debit - credit, 양수 = 차변 초과, 음수 = 대변 초과)
 * @param sortOrder   정렬 순서
 */
public record DailyAccountLine(
        String accountCode,
        String accountName,
        BigDecimal debit,
        BigDecimal credit,
        BigDecimal balance,
        int sortOrder
) {}
