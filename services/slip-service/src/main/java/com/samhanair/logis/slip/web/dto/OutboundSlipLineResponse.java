package com.samhanair.logis.slip.web.dto;

import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import java.time.LocalDate;
import java.math.BigDecimal;

/**
 * DPS 입고비교용 출고전표 라인 요약.
 *
 * <p>inventory-service 의 {@code OutboundSlipLineSummary} wire contract 와 필드명을 맞춘다.
 * productCode 는 현재 슬립 라인의 품번 snapshot 인 {@link SlipLine#getModelName()} 을 사용한다.
 */
public record OutboundSlipLineResponse(
        String slipNo,
        LocalDate slipDate,
        String partnerCode,
        String partnerName,
        String productCode,
        String productName,
        int quantity,
        BigDecimal totalAmount) {

    public OutboundSlipLineResponse(String slipNo, LocalDate slipDate, String partnerCode,
                                    String partnerName, String productCode, String productName,
                                    int quantity) {
        this(slipNo, slipDate, partnerCode, partnerName, productCode, productName, quantity,
                BigDecimal.ZERO);
    }

    public static OutboundSlipLineResponse from(Slip slip, SlipLine line) {
        return new OutboundSlipLineResponse(
                slip.getSlipNo(),
                slip.getSlipDate(),
                slip.getPartnerCode(),
                slip.getPartnerName(),
                line.getModelName(),
                line.getProductName(),
                line.getQuantity(), totalAmount(line));
    }

    private static BigDecimal totalAmount(SlipLine line) {
        BigDecimal supply = line.getSupplyAmount() == null ? line.getLineTotal() : line.getSupplyAmount();
        BigDecimal vat = line.getVatAmount() == null ? BigDecimal.ZERO : line.getVatAmount();
        return supply.add(vat);
    }
}
