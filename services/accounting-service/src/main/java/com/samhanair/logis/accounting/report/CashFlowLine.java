package com.samhanair.logis.accounting.report;

import java.math.BigDecimal;

/**
 * 현금흐름표 단일 활동 행.
 *
 * <p>활동 유형:
 * <ul>
 *   <li>OPERATING — 영업활동 현금흐름</li>
 *   <li>INVESTING  — 투자활동 현금흐름</li>
 *   <li>FINANCING  — 재무활동 현금흐름</li>
 * </ul>
 *
 * <p>흐름 방향:
 * <ul>
 *   <li>INFLOW  — 현금 유입 (양수)</li>
 *   <li>OUTFLOW — 현금 유출 (음수로 표시됨)</li>
 * </ul>
 *
 * @param accountCode  계정 코드
 * @param accountName  계정명
 * @param activityType 활동 유형 ("OPERATING" / "INVESTING" / "FINANCING")
 * @param amount       금액 (양수 = 유입, 음수 = 유출)
 * @param flowDirection 흐름 방향 ("INFLOW" / "OUTFLOW")
 */
public record CashFlowLine(
        String accountCode,
        String accountName,
        String activityType,
        BigDecimal amount,
        String flowDirection
) {}
