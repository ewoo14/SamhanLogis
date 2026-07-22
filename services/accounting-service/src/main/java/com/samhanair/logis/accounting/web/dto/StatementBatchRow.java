package com.samhanair.logis.accounting.web.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * 거래처별 거래명세서 batch row (PR-E2 BE-A10).
 *
 * <p>legacy GAS 4번 "거래처별 일괄 거래명세서" — 매출 분개 + 세금계산서 라인 snapshot +
 * 거래처별 그룹핑.
 *
 * <p>UUID 비공개 — partnerCode/bizNo + slipNo (taxInvoiceNo) 만 사용자 표시 데이터다.
 * selectionKey 는 선택 query 전달 전용이며 화면/인쇄물에 렌더링하지 않는다.
 *
 * @param selectionKey 선택/전달 전용 key. partnerId 그룹과 1:1이며 화면 표시용이 아니다.
 * @param partnerCode 거래처코드
 * @param bizNo 사업자등록번호 snapshot
 * @param partnerName 거래처 사업자명
 * @param chatRoomNames 단톡방 매핑 (0~N건)
 * @param slips 거래(세금계산서) 단건 그룹 — 각각 라인 포함
 */
public record StatementBatchRow(
        String selectionKey,
        String partnerCode,
        String bizNo,
        String partnerName,
        List<String> chatRoomNames,
        List<StatementSlip> slips) {

    /**
     * 거래명세서 1건 (= 세금계산서 1건). taxInvoiceNo 가 사용자 노출 식별자.
     */
    public record StatementSlip(
            String slipNo,
            LocalDate slipDate,
            BigDecimal totalSupply,
            BigDecimal totalVat,
            BigDecimal totalAmount,
            List<StatementLine> lines) {
    }

    /** 라인 — 품목명 / 규격 / 수량 / 단가 / 공급가액 / 세액. */
    public record StatementLine(
            String productName,
            String spec,
            BigDecimal quantity,
            BigDecimal unitPrice,
            BigDecimal supplyAmount,
            BigDecimal vatAmount) {
    }
}
