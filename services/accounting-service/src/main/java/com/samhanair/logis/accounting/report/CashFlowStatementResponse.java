package com.samhanair.logis.accounting.report;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 현금흐름표 (Cash Flow Statement) 응답 DTO.
 *
 * <p>간소형 직접법 기준 현금흐름표. 영업 / 투자 / 재무 3-활동으로 구성.
 *
 * <p>검증 필드 {@code cashReconciled}:
 * {@code beginningCash + netCashFlow ≈ endingCash} (허용 오차 0.01원).
 *
 * @param period             조회 기간 레이블 (예: "2026-04" 또는 "2026-01 ~ 2026-04")
 * @param fromDate           집계 시작 일자
 * @param toDate             집계 종료 일자
 * @param netIncome          당기순이익 (손익계산서 netIncome, 영업활동 시작점)
 * @param operatingAdjustments 운전자본 변동 등 영업활동 조정 항목 목록
 * @param cashFromOperating  영업활동 현금흐름 합계 (netIncome + operatingAdjustments 합)
 * @param investingActivities 투자활동 현금흐름 항목 목록 (유형/무형자산 매입/매각)
 * @param cashFromInvesting  투자활동 현금흐름 합계
 * @param financingActivities 재무활동 현금흐름 항목 목록 (차입/상환/증자)
 * @param cashFromFinancing  재무활동 현금흐름 합계
 * @param netCashFlow        순현금흐름 (CFO + CFI + CFF)
 * @param beginningCash      기초 현금 및 현금성자산 (1019 현금 + 1039 보통예금 누적, period 이전)
 * @param endingCash         기말 현금 및 현금성자산 (beginningCash + netCashFlow)
 * @param cashReconciled     검증 플래그 (beginningCash + netCashFlow ≈ endingCash)
 * @param generatedAt        보고서 생성 시각
 */
public record CashFlowStatementResponse(
        String period,
        LocalDate fromDate,
        LocalDate toDate,
        BigDecimal netIncome,
        List<CashFlowLine> operatingAdjustments,
        BigDecimal cashFromOperating,
        List<CashFlowLine> investingActivities,
        BigDecimal cashFromInvesting,
        List<CashFlowLine> financingActivities,
        BigDecimal cashFromFinancing,
        BigDecimal netCashFlow,
        BigDecimal beginningCash,
        BigDecimal endingCash,
        boolean cashReconciled,
        LocalDateTime generatedAt
) {}
