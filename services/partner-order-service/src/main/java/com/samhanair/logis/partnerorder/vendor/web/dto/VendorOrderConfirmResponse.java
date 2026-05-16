package com.samhanair.logis.partnerorder.vendor.web.dto;

import java.math.BigDecimal;

/**
 * vendor 발주서 confirm 응답.
 *
 * <p>UUID 비공개 — orderNo (사용자 표시) 만 노출.
 *
 * @param orderNo 신규 PartnerOrder 의 사용자 표시 주문번호 (예: "2026/05/10-1")
 * @param vendorName 확정 vendor
 * @param partnerCode 확정 거래처
 * @param totalAmount 합계
 * @param status 처리 상태 (예: "REGISTERED")
 */
public record VendorOrderConfirmResponse(
        String orderNo,
        String vendorName,
        String partnerCode,
        BigDecimal totalAmount,
        String status) {
}
