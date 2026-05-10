package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.TaxInvoiceLine;
import java.math.BigDecimal;
import java.util.UUID;

/**
 * 세금계산서 라인 응답 (P0-4 unit 필드 추가).
 *
 * <p>UUID 는 mutation path 용 (FE 화면 표시 금지 — UUID 비공개 원칙).
 */
public record TaxInvoiceLineResponse(
        UUID lineId,
        int lineNo,
        String itemName,
        String specification,
        String unit,
        BigDecimal quantity,
        BigDecimal unitPrice,
        BigDecimal supplyAmount,
        BigDecimal vatAmount,
        String memo
) {
    /** TaxInvoiceLine 엔티티 → 라인 응답 변환. */
    public static TaxInvoiceLineResponse of(TaxInvoiceLine line) {
        return new TaxInvoiceLineResponse(
                line.getId(),
                line.getLineNo(),
                line.getItemName(),
                line.getSpec(),
                line.getUnit(),
                line.getQuantity(),
                line.getUnitPrice(),
                line.getSupplyAmount(),
                line.getVatAmount(),
                line.getMemo()
        );
    }
}
