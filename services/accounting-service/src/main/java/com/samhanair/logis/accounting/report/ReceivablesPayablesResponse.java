package com.samhanair.logis.accounting.report;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 채권채무 현황 응답 DTO.
 *
 * <p>읽기전용 보고서이며 신규 Flyway 도메인 없이 POSTED+REVERSED(보상쌍 상쇄) 분개, 받을어음,
 * 수금계획 데이터를 거래처별로 집계한다.
 *
 * @param asOfDate        기준일
 * @param direction       조회 방향
 * @param receivableTotal 채권 잔액 합계
 * @param payableTotal    채무 잔액 합계
 * @param netTotal        순잔액 합계(채권-채무)
 * @param partnerCount    거래처 수
 * @param lines           거래처별 행
 * @param generatedAt     생성 시각
 */
public record ReceivablesPayablesResponse(
        LocalDate asOfDate,
        ReceivablesPayablesDirection direction,
        BigDecimal receivableTotal,
        BigDecimal payableTotal,
        BigDecimal netTotal,
        int partnerCount,
        List<ReceivablesPayablesLine> lines,
        LocalDateTime generatedAt
) {
}
