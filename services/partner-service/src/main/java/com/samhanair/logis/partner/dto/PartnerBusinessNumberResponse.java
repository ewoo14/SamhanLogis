package com.samhanair.logis.partner.dto;

import com.samhanair.logis.partner.domain.Partner;
import java.util.UUID;

/**
 * 거래처 사업자등록번호 조회 응답 — slip-service 가 전표 생성/수정 시 사업자등록번호를
 * snapshot 하기 위해 사용하는 internal endpoint 응답 DTO.
 *
 * <p>UUID 비공개 가드: 본 응답은 형제 service (slip-service) 간 내부 통신에만 사용되므로
 * partnerId UUID 포함이 허용됨 (사용자 화면 직접 노출 X).
 *
 * @param partnerId 거래처 UUID (호출자 참조용)
 * @param businessRegistrationNo 사업자등록번호 (Partner.bizNo)
 * @param partnerName 거래처 상호 (audit / 디버깅 참조용)
 */
public record PartnerBusinessNumberResponse(
        UUID partnerId,
        String businessRegistrationNo,
        String partnerName) {

    /**
     * Partner 엔티티로부터 응답 record 를 생성한다.
     *
     * @param partner 조회된 거래처 엔티티
     * @return PartnerBusinessNumberResponse
     */
    public static PartnerBusinessNumberResponse from(Partner partner) {
        return new PartnerBusinessNumberResponse(
                partner.getId(),
                partner.getBizNo(),
                partner.getName());
    }
}
