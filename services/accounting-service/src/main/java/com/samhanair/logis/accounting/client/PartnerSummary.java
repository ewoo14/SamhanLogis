package com.samhanair.logis.accounting.client;

import java.util.UUID;
import java.math.BigDecimal;

/**
 * partner-service 가 반환하는 거래처 요약 (PR-E2 BE-A8/A9/A10 의존).
 *
 * <p>partner-service 의 {@code GET /internal/partners/{partnerCode}} 응답 envelope.data
 * 매핑. accounting-service 가 partner 도메인을 직접 import 하지 않도록 wire-format record.
 *
 * <p>UUID 비공개 가드: partnerId 는 내부 추적용 (분개 partnerId 매칭). 사용자 노출은
 * partnerCode + name + businessNo.
 *
 * <p><b>#810 적대검증 R1 (L4-H1)</b> — {@link #status} 신규 추가. partner-service
 * {@code PartnerInternalResponse.status}(ACTIVE/SUSPENDED/TERMINATED)를 그대로 담아
 * 입금자명 매핑 자동 적용의 stale(비활성 거래처) 판정에 사용한다.
 */
public record PartnerSummary(
        UUID partnerId,
        String partnerCode,
        String name,
        String businessNo,
        String address,
        BigDecimal creditLimit,
        String status) {

    public PartnerSummary(UUID partnerId, String partnerCode, String name, String businessNo, String address) {
        this(partnerId, partnerCode, name, businessNo, address, null, null);
    }

    public PartnerSummary(UUID partnerId, String partnerCode, String name, String businessNo, String address,
                          BigDecimal creditLimit) {
        this(partnerId, partnerCode, name, businessNo, address, creditLimit, null);
    }

    /** partner-service wire field 이름 호환 accessor. */
    public String bizNo() {
        return businessNo;
    }

    /**
     * 거래처 master 활성(ACTIVE) 여부 — 입금자명 매핑 자동 적용 게이트.
     *
     * <p>status 를 전송하지 않는 legacy/batch 응답(null)은 기존 동작 보존을 위해 활성으로 간주한다.
     * {@code SUSPENDED}/{@code TERMINATED} 등 비-ACTIVE 값은 전부 비활성으로 판정한다.
     *
     * @return ACTIVE 또는 status 미전송이면 {@code true}
     */
    public boolean isActiveStatus() {
        return status == null || status.isBlank() || "ACTIVE".equalsIgnoreCase(status.trim());
    }
}
