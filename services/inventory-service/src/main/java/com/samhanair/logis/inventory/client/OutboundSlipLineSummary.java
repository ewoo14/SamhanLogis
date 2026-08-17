package com.samhanair.logis.inventory.client;
import java.time.LocalDate;
import java.math.BigDecimal;

/**
 * slip-service {@code GET /internal/slips/outbound-lines} 응답의 라인 단위 요약.
 *
 * <p>슬립 헤더(slipNo/slipDate/partner)와
 * 라인(productCode/productName/quantity) 을 평탄화한 record. inventory-service 가 slip-service
 * 도메인 클래스를 직접 import 하지 않도록 wire-format 의 record 사본을 둔다.
 *
 * <p>UUID 비공개 — 본 record 는 productCode / partnerCode 비즈니스 식별자만 노출 (사용자에게도
 * 그대로 표시 가능). productId / partnerId UUID 는 의도적으로 포함하지 않는다.
 *
 * <p>{@link JsonInclude} 처리 없이 nullable 필드 허용 — slip-service 가 일부 필드를 빈 값으로
 * 채울 수 있다 (예: partnerCode 미발급 거래처). 매칭 알고리즘에서 null 가드.
 *
 * @param slipNo       전표번호 (사용자 노출 식별자, 예: 2026/05/09-001)
 * @param slipDate     전표 일자
 * @param partnerCode  거래처 코드 (사용자 노출 식별자, nullable)
 * @param partnerName  거래처명 snapshot (nullable)
 * @param productCode  품번 (DPS 매칭 키, 사용자 노출 식별자)
 * @param productName  품목명 (nullable)
 * @param quantity     출고 수량
 */
public record OutboundSlipLineSummary(
        String slipNo,
        LocalDate slipDate,
        String partnerCode,
        String partnerName,
        String productCode,
        String productName,
        int quantity,
        BigDecimal totalAmount) {

    public OutboundSlipLineSummary(String slipNo, LocalDate slipDate, String partnerCode,
                                   String partnerName, String productCode, String productName,
                                   int quantity) {
        this(slipNo, slipDate, partnerCode, partnerName, productCode, productName, quantity,
                BigDecimal.ZERO);
    }
}
