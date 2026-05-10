package com.samhanair.logis.partner.tab.dto;

import com.samhanair.logis.partner.domain.PartnerShippingAddress;
import java.util.UUID;

/**
 * 거래처 배송지 응답 (4탭 탭 3).
 *
 * <p>UUID 비공개 가드 원칙에 따라 {@link #id}는 FE 삭제/수정 요청용 path variable 전용으로만 사용.
 * 사용자 화면에서는 alias/address 로 식별.
 *
 * @param id            배송지 UUID (path variable 전용, 사용자 화면 미노출)
 * @param alias         배송지 별칭
 * @param zipCode       우편번호
 * @param address       주소
 * @param phone         연락처
 * @param receiverName  수신 담당자명
 * @param isDefault     기본 배송지 여부
 * @param memo          비고
 */
public record PartnerShippingAddressResponse(
        UUID id,
        String alias,
        String zipCode,
        String address,
        String phone,
        String receiverName,
        Boolean isDefault,
        String memo
) {

    /**
     * PartnerShippingAddress 엔티티로부터 응답 생성.
     *
     * @param a 배송지 엔티티
     * @return PartnerShippingAddressResponse
     */
    public static PartnerShippingAddressResponse from(PartnerShippingAddress a) {
        return new PartnerShippingAddressResponse(
                a.getId(),
                a.getAlias(),
                a.getZipCode(),
                a.getAddress(),
                a.getPhone(),
                a.getReceiverName(),
                a.getIsDefault(),
                a.getMemo()
        );
    }
}
