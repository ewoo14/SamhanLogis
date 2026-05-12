package com.samhanair.logis.partnerauth.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.samhanair.logis.partnerauth.domain.PartnerAuth;

/**
 * "주문서 승인" 목록 한 row — desktop 영업 화면 `/sales/order-approvals` grid source.
 *
 * <p>frontend 의 `PartnerApproval` interface 1:1 매핑.
 * UUID 비공개 — partnerCode (= bizNo 사업자번호) 만 노출.
 *
 * <p>partnerName / assignedManagerName 은 partner-auth-service 가 단독 보유하지 않는다.
 * partnerName 은 partner-service 의 Partner.name 또는 dc-config-service 의 Partner.companyName
 * 에서 lookup 해야 하지만, 본 PR 에서는 N/A 폴백 (partnerCode 그대로) — Feign client 연동은
 * 후속 backlog. assignedManagerName 도 마찬가지로 추후 employee mapping 연동 시 채움.
 */
@JsonInclude(JsonInclude.Include.ALWAYS)
public record PartnerApprovalResponse(
        String partnerCode,
        String partnerName,
        PartnerApprovalStatus status,
        String approvalRequestedAt,
        boolean pcTutorialDone,
        boolean mobileTutorialDone,
        String assignedManagerName) {

    public static PartnerApprovalResponse from(PartnerAuth pa) {
        String requestedAt = pa.getCreatedAt() == null ? null : pa.getCreatedAt().toString();
        return new PartnerApprovalResponse(
                pa.getBizNo(),
                pa.getBizNo(),
                PartnerApprovalStatus.fromInternal(pa.getStatus()),
                requestedAt,
                pa.isTutorialPcDone(),
                pa.isTutorialMobileDone(),
                null);
    }
}
