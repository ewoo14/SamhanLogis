package com.samhanair.logis.partner.tab.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 거래처 배송지 등록/수정 요청 DTO (4탭 탭 3).
 *
 * @param alias        배송지 별칭 (nullable)
 * @param zipCode      우편번호 (nullable)
 * @param address      주소 (필수)
 * @param phone        연락처 (nullable)
 * @param receiverName 수신 담당자명 (nullable)
 * @param isDefault    기본 배송지 여부 (null 시 false)
 * @param memo         비고 (nullable)
 */
public record PartnerShippingAddressRequest(
        @Size(max = 100) String alias,
        @Size(max = 10) String zipCode,
        @NotBlank @Size(max = 500) String address,
        @Size(max = 30) String phone,
        @Size(max = 50) String receiverName,
        Boolean isDefault,
        @Size(max = 500) String memo
) {
}
