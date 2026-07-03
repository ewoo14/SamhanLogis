package com.samhanair.logis.accounting.report;

import java.math.BigDecimal;

/**
 * 손익계산서 단일 계정 행.
 *
 * <p>amount 부호 규약:
 * <ul>
 *   <li>REVENUE — credit - debit (양수 = 매출 발생)</li>
 *   <li>COST_OF_SALES / SGA — debit - credit (양수 = 비용 발생)</li>
 *   <li>NON_OPERATING — 수익 계정: credit - debit, 비용 계정: debit - credit (service 가 계산)</li>
 * </ul>
 *
 * @param accountCode 계정 코드 (예: "401")
 * @param accountName 계정명 (예: "상품매출")
 * @param category    계정 카테고리 문자열 (AccountCategory.name())
 * @param amount      집계 금액 (POSTED+REVERSED(보상쌍 상쇄) 분개 기준)
 * @param sortOrder   ChartOfAccount.displayOrder 기준 정렬 순서
 */
public record IncomeStatementLine(
        String accountCode,
        String accountName,
        String category,
        BigDecimal amount,
        int sortOrder
) {}
