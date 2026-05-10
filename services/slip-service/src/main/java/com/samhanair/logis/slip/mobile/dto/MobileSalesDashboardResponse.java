package com.samhanair.logis.slip.mobile.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 영업 직원 모바일 대시보드 응답 — P1-4 Native 영업 앱.
 *
 * <p>조회 기간(fromDate~toDate) 기준의 매출 요약, 미수금 현황, 견적 진행 상황을
 * 한 번의 API 호출로 반환한다. 모바일 화면의 홈 카드 3개(매출/미수금/견적)에
 * 일대일 매핑.
 *
 * <p>필드 설명:
 * <ul>
 *   <li>{@link #fromDate} / {@link #toDate} — 집계 기간 (요청 파라미터 echo-back)</li>
 *   <li>{@link #totalSalesAmount} — 기간 내 CONFIRMED 슬립의 공급가액 합계</li>
 *   <li>{@link #totalOutstanding} — 현재 미수금 합계 (기간 무관, 전체 활성 거래처 합산)</li>
 *   <li>{@link #estimateDraftCount} — 작성중(DRAFT) 견적서 건수</li>
 *   <li>{@link #estimateSentCount} — 발송완료(SENT) 견적서 건수</li>
 *   <li>{@link #estimateAcceptedCount} — 수주완료(ACCEPTED) 견적서 건수</li>
 *   <li>{@link #requesterId} — 요청자 user-id (필터 기준)</li>
 * </ul>
 */
public record MobileSalesDashboardResponse(
        LocalDate fromDate,
        LocalDate toDate,
        BigDecimal totalSalesAmount,
        BigDecimal totalOutstanding,
        long estimateDraftCount,
        long estimateSentCount,
        long estimateAcceptedCount,
        String requesterId) {
}
