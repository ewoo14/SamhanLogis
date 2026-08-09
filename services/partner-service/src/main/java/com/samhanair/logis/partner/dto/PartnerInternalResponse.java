package com.samhanair.logis.partner.dto;

import com.samhanair.logis.partner.domain.Partner;
import com.samhanair.logis.partner.domain.PartnerStatus;
import java.math.BigDecimal;
import java.util.UUID;

/**
 * Internal endpoint 응답 DTO — slip-service 의 partnerCode → partnerId lookup 결과.
 *
 * <p>본 응답은 내부 형제 service 만 받으므로 UUID 노출 가드 (memory feedback_uuid_no_user_visibility) 적용
 * 대상이 아니다 (사용자 화면 직접 노출 X).
 *
 * <p><b>PR #746(#22) 라운드1 fix</b> — {@link #bizNo} 신규 추가. accounting-service
 * {@code PartnerLookupClient.findByPartnerId} 와 partner-order-service
 * {@code PartnerMig8LookupClient.findByPartnerId} 가 모두 {@code GET /internal/partners/{id}/summary}
 * 응답에서 사업자등록번호를 찾으나, 본 필드가 부재해 항상 lookup miss(빈 값)로 처리되던 결함을 해소한다
 * (MIG-8 partner-order 이식이 partner lookup miss 로 100% reject 되던 근본 원인).
 *
 * @param partnerId 거래처 UUID — 호출자가 자체 도메인 (슬립 등) 에 외래 키로 보관
 * @param partnerCode 사용자 노출 식별자 (호출자가 응답을 사용자 화면에 표시할 경우 본 필드만 사용)
 * @param name 거래처 상호
 * @param bizNo 사업자등록번호 (Partner.bizNo)
 * @param creditLimit 신용한도 (원)
 * @param outstandingBalance 현재 미수금 잔액 (원)
 * @param status 거래 상태 (ACTIVE / SUSPENDED / TERMINATED)
 */
public record PartnerInternalResponse(
        UUID partnerId,
        String partnerCode,
        String name,
        String bizNo,
        BigDecimal creditLimit,
        BigDecimal outstandingBalance,
        PartnerStatus status,
        String email,
        String email2
) {

    public PartnerInternalResponse(UUID partnerId, String partnerCode, String name, String bizNo,
                                   BigDecimal creditLimit, BigDecimal outstandingBalance,
                                   PartnerStatus status) {
        this(partnerId, partnerCode, name, bizNo, creditLimit, outstandingBalance, status, "", "");
    }

    public static PartnerInternalResponse from(Partner p) {
        return new PartnerInternalResponse(
                p.getId(),
                p.getPartnerCode(),
                p.getName(),
                p.getBizNo(),
                p.getCreditLimit(),
                p.getOutstandingBalance(),
                p.getStatus(), p.getEmail(), p.getEmail2());
    }
}
