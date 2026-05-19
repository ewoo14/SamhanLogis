package com.samhanair.logis.partner.tab.dto;

import com.samhanair.logis.partner.domain.Partner;
import com.samhanair.logis.partner.domain.PartnerStatus;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 거래처 4탭 기본정보 응답 (탭 1).
 *
 * <p>UUID 비공개 가드 — id 미포함, partnerCode 만 식별자 노출.
 *
 * @param partnerCode       사용자 노출 식별자
 * @param bizNo             사업자번호
 * @param name              거래처 상호
 * @param representative    대표자명
 * @param businessType      업태
 * @param industry          종목
 * @param address           주소 (legacy)
 * @param phone             대표 연락처
 * @param fax               FAX
 * @param email             이메일 (대표)
 * @param email2            이메일 (보조)
 * @param mobile            휴대전화
 * @param website           홈페이지
 * @param partnerGroup1     거래처 분류1
 * @param partnerGroup2     거래처 분류2
 * @param creditLimit       신용한도
 * @param outstandingBalance 미수금 잔액
 * @param status            거래 상태
 * @param registrationDate  거래 시작일 (회계상)
 * @param transferInfo      이체정보 (MIG-1 신규, 이카운트 V9)
 * @param note              특이사항 (MIG-1 신규, 이카운트 V9)
 * @param managerName       담당자명 (MIG-1 신규, 이카운트 V9)
 */
public record PartnerBasicResponse(
        String partnerCode,
        String bizNo,
        String name,
        String representative,
        String businessType,
        String industry,
        String address,
        String phone,
        String fax,
        String email,
        String email2,
        String mobile,
        String website,
        String partnerGroup1,
        String partnerGroup2,
        BigDecimal creditLimit,
        BigDecimal outstandingBalance,
        PartnerStatus status,
        LocalDate registrationDate,
        String transferInfo,
        String note,
        String managerName
) {

    /**
     * Partner 엔티티로부터 기본정보 응답 생성.
     *
     * @param p 거래처 엔티티
     * @return PartnerBasicResponse
     */
    public static PartnerBasicResponse from(Partner p) {
        return new PartnerBasicResponse(
                p.getPartnerCode(),
                p.getBizNo(),
                p.getName(),
                p.getRepresentative(),
                p.getBusinessType(),
                p.getIndustry(),
                p.getAddress(),
                p.getPhone(),
                p.getFax(),
                p.getEmail(),
                p.getEmail2(),
                p.getMobile(),
                p.getWebsite(),
                p.getPartnerGroup1(),
                p.getPartnerGroup2(),
                p.getCreditLimit(),
                p.getOutstandingBalance(),
                p.getStatus(),
                p.getRegistrationDate(),
                p.getTransferInfo(),
                p.getNote(),
                p.getManagerName()
        );
    }
}
