package com.samhanair.logis.partnerauth.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.samhanair.logis.partnerauth.domain.PartnerAuth;

/**
 * "주문서 승인" 목록 한 row — desktop 영업 화면 `/sales/order-approvals` grid source.
 *
 * <p>frontend 의 `PartnerApproval` interface 1:1 매핑.
 * UUID 비공개 — partnerCode (= bizNo 사업자번호) 만 노출.
 *
 * <p>4a backlog 마무리: dc-config-service 의 Partner.name 과 Partner.manager 를 RPC 로
 * 한 번에 조회해 partnerName / assignedManagerName 을 채운다 (resolve 실패 시 폴백).
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
     * 폴백 — partnerName 을 partnerCode (사업자번호) 로 채움, manager null.
     * dc-config RPC 가 없는 경로 (예: 단위 테스트, 장애 시) 에서 사용.
     */
    public static PartnerApprovalResponse from(PartnerAuth pa) {
        return from(pa, null, null);
    }

    /**
     * 4a 1차 — partnerName 만 resolve. assignedManagerName 은 null 폴백.
     * @deprecated 신규 호출자는 {@link #from(PartnerAuth, String, String)} 사용.
     */
    @Deprecated
    public static PartnerApprovalResponse from(PartnerAuth pa, String resolvedName) {
        return from(pa, resolvedName, null);
    }

    /**
     * 4a 마무리 — dc-config RPC 로 resolve 된 partnerName + assignedManagerName 적용.
     * 각각 null/blank 시: partnerName 은 partnerCode 폴백, manager 는 null 유지.
     */
    public static PartnerApprovalResponse from(PartnerAuth pa, String resolvedName,
                                               String resolvedManagerName) {
        String requestedAt = pa.getCreatedAt() == null ? null : pa.getCreatedAt().toString();
        String name = (resolvedName == null || resolvedName.isBlank()) ? pa.getBizNo() : resolvedName;
        String manager = (resolvedManagerName == null || resolvedManagerName.isBlank())
                ? null : resolvedManagerName;
        return new PartnerApprovalResponse(
                pa.getBizNo(),
                name,
                PartnerApprovalStatus.fromInternal(pa.getStatus()),
                requestedAt,
                pa.isTutorialPcDone(),
                pa.isTutorialMobileDone(),
                manager);
    }
}
