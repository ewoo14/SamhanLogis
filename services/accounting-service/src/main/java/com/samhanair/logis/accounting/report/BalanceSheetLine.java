package com.samhanair.logis.accounting.report;

import java.math.BigDecimal;

/**
 * 재무상태표 단일 계정 행.
 *
 * <p>amount 부호 규약:
 * <ul>
 *   <li>자산 (100~) — debit - credit (차변 잔액, 양수 = 자산 보유)</li>
 *   <li>부채 (200~) — credit - debit (대변 잔액, 양수 = 부채 존재)</li>
 *   <li>자본 (300~) — credit - debit (대변 잔액, 양수 = 자본 존재)</li>
 * </ul>
 *
 * @param accountCode 계정 코드 (예: "1039")
 * @param accountName 계정명 (예: "보통예금")
 * @param category    계정 카테고리 문자열 (AccountCategory.name())
 * @param amount      asOfDate 기준 누적 잔액
 * @param sortOrder   ChartOfAccount.displayOrder 기준 정렬 순서
 */
public record BalanceSheetLine(
        String accountCode,
        String accountName,
        String category,
        BigDecimal amount,
        int sortOrder
) {}
