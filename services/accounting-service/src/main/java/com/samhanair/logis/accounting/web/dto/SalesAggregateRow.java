package com.samhanair.logis.accounting.web.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 거래처별 매출/수금/채권 집계 row (PR-E2 BE-A8).
 *
 * <p>legacy GAS 3번 "거래처별 원장생성" 의 매출/수금/채권 집계 데이터 — 자체 분개 + 세금계산서
 * 자동 조회로 생성. 한국 일반기업회계기준 코드 기반:
 * <ul>
 *   <li>{@code salesTotal} = 4019 (상품매출) 분개 라인 합 (대변잔액)</li>
 *   <li>{@code paymentTotal} = 1089 (외상매출금) 대변 합 (수금/회수)</li>
 *   <li>{@code receivableBalance} = 1089 차변잔액 (현재 미회수 채권)</li>
 * </ul>
 *
 * <p>UUID 비공개 가드 — partnerCode + bizNo + partnerName 만 노출, partnerId 미포함.
 *
 * @param partnerCode 거래처코드 (사용자 노출)
 * @param bizNo 사업자번호 숫자 문자열. 미조회 시 빈 문자열
 * @param partnerName 거래처 사업자명 (snapshot)
 * @param salesTotal 기간 매출 합계
 * @param paymentTotal 기간 수금 합계
 * @param receivableBalance 기간말 채권 잔액
 * @param periodFrom 집계 시작 일자
 * @param periodTo 집계 종료 일자
 */
public record SalesAggregateRow(
        String partnerCode,
        String bizNo,
        String partnerName,
        BigDecimal salesTotal,
        BigDecimal paymentTotal,
        BigDecimal adjustmentTotal,
        BigDecimal receivableBalance,
        LocalDate periodFrom,
        LocalDate periodTo) {
}
