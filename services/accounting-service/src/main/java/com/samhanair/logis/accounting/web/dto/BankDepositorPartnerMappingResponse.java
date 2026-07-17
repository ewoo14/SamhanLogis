package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.BankDepositorPartnerMapping;
import com.samhanair.logis.accounting.client.PartnerSummary;
import java.time.LocalDateTime;

/**
 * UUID를 숨기고 business key와 거래처 표시값만 반환하는 입금자명 매핑 응답.
 *
 * <p>#810 적대검증 R3 (L5-L1) 계약 — {@code targetStatus}/{@code staleTarget} 3분류:
 * <ul>
 *   <li>FOUND: {@code targetStatus}=거래처 status(ACTIVE/SUSPENDED/…), 비활성이면 {@code staleTarget=true}</li>
 *   <li>NOT_FOUND(삭제): {@code targetStatus=null}·{@code staleTarget=true}</li>
 *   <li>UNAVAILABLE(조회 일시 장애): {@code targetStatus="UNAVAILABLE"}·{@code staleTarget=false}
 *       — 삭제/비활성으로 오표기하지 않는다</li>
 * </ul>
 */
public record BankDepositorPartnerMappingResponse(
        String rawName,
        String normalizedName,
        String partnerCode,
        String partnerName,
        String targetStatus,
        boolean staleTarget,
        LocalDateTime modifiedAt,
        String actor,
        boolean active
) {
    /** 조회 일시 장애 표기용 targetStatus 상수. */
    public static final String TARGET_STATUS_UNAVAILABLE = "UNAVAILABLE";

    /** 매핑 entity와 거래처 summary를 응답으로 변환한다. */
    public static BankDepositorPartnerMappingResponse of(BankDepositorPartnerMapping mapping,
                                                         PartnerSummary partner) {
        return new BankDepositorPartnerMappingResponse(
                mapping.getRawName(), mapping.getNormalizedName(),
                partner == null ? mapping.getPartnerCodeSnapshot() : partner.partnerCode(),
                partner == null ? null : partner.name(),
                partner == null ? null : partner.status(),
                partner == null || !partner.isActiveStatus(),
                mapping.getModifiedAt(), displayActor(mapping), !Boolean.TRUE.equals(mapping.getIsDeleted()));
    }

    /**
     * 거래처 조회 일시 장애(UNAVAILABLE) 응답 — #810 적대검증 R3 (L5-L1).
     *
     * <p>stale(삭제/비활성)로 붕괴시키지 않고 {@code targetStatus="UNAVAILABLE"}·
     * {@code staleTarget=false} 로 구분한다. 거래처 표시는 저장된 snapshot 으로 대체한다.
     */
    public static BankDepositorPartnerMappingResponse unavailable(BankDepositorPartnerMapping mapping) {
        return new BankDepositorPartnerMappingResponse(
                mapping.getRawName(), mapping.getNormalizedName(),
                mapping.getPartnerCodeSnapshot(), null,
                TARGET_STATUS_UNAVAILABLE, false,
                mapping.getModifiedAt(), displayActor(mapping), !Boolean.TRUE.equals(mapping.getIsDeleted()));
    }

    /** modifiedBy 가 UUID 형태면 "사용자"로 마스킹한다 (UUID 사용자 비공개 가드). */
    private static String displayActor(BankDepositorPartnerMapping mapping) {
        String modifiedBy = mapping.getModifiedBy();
        return modifiedBy != null && modifiedBy.matches("[0-9a-fA-F-]{36}") ? "사용자" : modifiedBy;
    }
}
