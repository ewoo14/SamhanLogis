package com.samhanair.logis.slip.web.dto;

import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * 거래처별 원장에 표시할 출고전표 read projection.
 *
 * <p>원장 화면의 외부 계약은 전표번호·거래처코드·거래처명 같은 업무 식별자만 사용한다.
 * 내부 중복제거용 slipId는 accounting-service internal 호출에서만 소비하고 화면에는 노출하지 않는다.
 * 배송주소는 {@code slips.delivery_address} 원본만 전사하며 다른 주소나 적요로 대체하지 않는다.
 */
public record PartnerLedgerSalesResponse(
        String slipNo,
        LocalDate slipDate,
        String status,
        String partnerCode,
        UUID partnerId,
        String partnerName,
        String businessNumber,
        String deliveryAddress,
        List<Line> lines) {

    public PartnerLedgerSalesResponse(String slipNo, LocalDate slipDate, String status,
                                      String partnerCode, String partnerName,
                                      String deliveryAddress, List<Line> lines) {
        this(slipNo, slipDate, status, partnerCode, null, partnerName, null, deliveryAddress, lines);
    }

    public PartnerLedgerSalesResponse(String slipNo, LocalDate slipDate, String status,
                                      String partnerCode, String partnerName, String businessNumber,
                                      String deliveryAddress, List<Line> lines) {
        this(slipNo, slipDate, status, partnerCode, null, partnerName, businessNumber, deliveryAddress, lines);
    }

    /**
     * 원장 출고전표 품목 projection.
     *
     * @param productName 품목명 snapshot
     * @param modelName 모델명 snapshot
     * @param quantity 수량
     * @param unitPriceWithVat 부가세 포함 단가
     * @param lineAmount 부가세 포함 품목 금액
     */
    public record Line(
            String productName,
            String modelName,
            int quantity,
            BigDecimal unitPriceWithVat,
            BigDecimal lineAmount) {
    }

    /**
     * 전표 entity를 원장 전용 외부 read projection으로 변환한다.
     *
     * @param slip 활성 OUTBOUND 전표
     * @return UUID 없는 원장 출고전표 응답
     */
    public static PartnerLedgerSalesResponse from(Slip slip) {
        List<Line> lines = slip.getLines().stream()
                .map(PartnerLedgerSalesResponse::toLine)
                .toList();
        return new PartnerLedgerSalesResponse(
                slip.getSlipNo(),
                slip.getSlipDate(),
                slip.getStatus().name(),
                slip.getPartnerCode(),
                slip.getPartnerId(),
                slip.getPartnerName(),
                slip.getBusinessNumber(),
                slip.getDeliveryAddress(),
                lines);
    }

    private static Line toLine(SlipLine line) {
        return new Line(
                line.getProductName(),
                line.getModelName(),
                line.getQuantity(),
                line.getUnitPriceWithVat(),
                lineAmount(line));
    }

    /**
     * 저장된 권위 금액을 우선해 VAT 포함 품목 금액을 계산한다.
     *
     * <p>공급가액과 부가세가 모두 있으면 이를 더한다. 이는 소수 단가를 다시 수량과 곱할 때
     * 저장 시 원 단위 반올림과 달라지는 drift를 막는다. 구 legacy 라인은 보유한 VAT 포함
     * 단가 또는 기존 공급가액·부가세 값으로만 계산하고 배송주소와 달리 다른 필드로 보정하지 않는다.
     */
    private static BigDecimal lineAmount(SlipLine line) {
        if (line.getSupplyAmount() != null && line.getVatAmount() != null) {
            return line.getSupplyAmount().add(line.getVatAmount());
        }
        if (line.getUnitPriceWithVat() != null) {
            return line.getUnitPriceWithVat().multiply(BigDecimal.valueOf(line.getQuantity()));
        }
        if (line.getLineTotal() == null) {
            return null;
        }
        BigDecimal vatAmount = line.getVatAmount() == null ? BigDecimal.ZERO : line.getVatAmount();
        return line.getLineTotal().add(vatAmount);
    }
}
