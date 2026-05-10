package com.samhanair.logis.partner.tab.dto;

import com.samhanair.logis.partner.domain.PartnerContact;
import java.util.UUID;

/**
 * 거래처 담당자 응답 (4탭 탭 4).
 *
 * <p>UUID 비공개 가드 원칙에 따라 {@link #id}는 FE 삭제/수정 요청용 path variable 전용.
 * 사용자 화면에서는 contactName/position 으로 식별.
 *
 * @param id          담당자 UUID (path variable 전용, 사용자 화면 미노출)
 * @param contactName 담당자명
 * @param position    직책/직위
 * @param phone       직통 전화
 * @param email       이메일
 * @param isPrimary   주 담당자 여부
 * @param memo        비고
 */
public record PartnerContactResponse(
        UUID id,
        String contactName,
        String position,
        String phone,
        String email,
        Boolean isPrimary,
        String memo
) {

    /**
     * PartnerContact 엔티티로부터 응답 생성.
     *
     * @param c 담당자 엔티티
     * @return PartnerContactResponse
     */
    public static PartnerContactResponse from(PartnerContact c) {
        return new PartnerContactResponse(
                c.getId(),
                c.getContactName(),
                c.getPosition(),
                c.getPhone(),
                c.getEmail(),
                c.getIsPrimary(),
                c.getMemo()
        );
    }
}
