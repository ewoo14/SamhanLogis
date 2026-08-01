package com.samhanair.logis.slip.web.dto;

import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * 회계 전표 배분 source 검색용 internal 전표 요약.
 *
 * <p>UUID 는 service-to-service 계약 및 mutation payload 용이며 화면 표시는 slipNo 를 사용한다.
 */
public record SlipSummary(
        UUID slipId,
        String slipNo,
        String slipType,
        String status,
        LocalDate slipDate,
        UUID partnerId,
        String partnerCode,
        String partnerName,
        List<LineSummary> lines
) {
    public record LineSummary(
            UUID lineId,
            int lineNo,
            String productCode,
            String productName,
            int quantity,
            BigDecimal unitPrice,
            BigDecimal lineTotal
    ) {}

    public static SlipSummary of(Slip slip) {
        List<LineSummary> lineSummaries = new java.util.ArrayList<>();
        int lineNo = 1;
        for (SlipLine line : slip.getLines()) {
            lineSummaries.add(new LineSummary(
                    line.getId(),
                    lineNo++,
                    line.getProductName(),
                    line.getProductName(),
                    line.getQuantity(),
                    line.getUnitPrice(),
                    line.getLineTotal()));
        }
        return new SlipSummary(
                slip.getId(),
                slip.getSlipNo(),
                slip.getSlipType().name(),
                slip.getStatus().name(),
                slip.getSlipDate(),
                slip.getPartnerId(),
                slip.getPartnerCode(),
                slip.getPartnerName(),
                lineSummaries);
    }

}
