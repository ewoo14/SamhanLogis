package com.samhanair.logis.accounting.report;

import java.math.BigDecimal;

/**
 * 자본변동표 단일 변동 행.
 *
 * <p>변동 유형 ({@code changeType}):
 * <ul>
 *   <li>CAPITAL_INCREASE — 유상증자 (자본금 + 주식발행초과금 증가)</li>
 *   <li>DIVIDEND         — 배당금 지급 (이익잉여금 감소)</li>
 *   <li>NET_INCOME       — 당기순이익 (이익잉여금 증가)</li>
 * </ul>
 *
 * @param accountCode  계정 코드 (예: "3329" 자본금, "3779" 이익잉여금)
 * @param accountName  계정명
 * @param changeType   변동 유형 문자열
 * @param description  변동 사유 설명
 * @param amount       변동 금액 (양수 = 증가, 음수 = 감소)
 */
public record EquityChangeLine(
        String accountCode,
        String accountName,
        String changeType,
        String description,
        BigDecimal amount
) {}
