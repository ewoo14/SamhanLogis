package com.samhanair.logis.partnerauth.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.samhanair.logis.partnerauth.domain.PartnerAuth;

/**
 * "주문서 승인" 목록 한 row — desktop 영업 화면 `/sales/order-approvals` grid source.
 *
 * <p>frontend 의 `PartnerApproval` interface 1:1 매핑.
 * UUID 비공개 — partnerCode (= bizNo 사업자번호) 만 노출.
 *
 * <p>4a backlog 마무리: partnerName 은 dc-config-service 의 Partner.name 을 RPC 로
 * 조회해 채운다 (resolve 실패 시 partnerCode 폴백). assignedManagerName 은 추후
 * employee mapping 연동 시 채움.
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

    /**
     * 폴백 — partnerName 을 partnerCode (사업자번호) 로 채움.
     * dc-config RPC 가 없는 경로 (예: 단위 테스트, 장애 시) 에서 사용.
     */
    public static PartnerApprovalResponse from(PartnerAuth pa) {
        return from(pa, null);
    }

    /**
     * 4a 백로그 — dc-config RPC 로 resolve 된 partnerName 을 우선 사용. null/blank 시 partnerCode 폴백.
     */
    public static PartnerApprovalResponse from(PartnerAuth pa, String resolvedName) {
        String requestedAt = pa.getCreatedAt() == null ? null : pa.getCreatedAt().toString();
        String name = (resolvedName == null || resolvedName.isBlank()) ? pa.getBizNo() : resolvedName;
        return new PartnerApprovalResponse(
                pa.getBizNo(),
                name,
                PartnerApprovalStatus.fromInternal(pa.getStatus()),
                requestedAt,
                pa.isTutorialPcDone(),
                pa.isTutorialMobileDone(),
                null);
    }
}
