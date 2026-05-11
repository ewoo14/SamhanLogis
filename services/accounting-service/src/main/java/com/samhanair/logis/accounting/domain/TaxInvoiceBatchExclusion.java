package com.samhanair.logis.accounting.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 세금계산서 일괄발행 제외 거래처 마스터.
 *
 * <p>GAS 의 Notion DB 저장 패턴을 RDB 로 대체.
 * 제외 거래처 코드 단위로 관리되며 {@code partnerCode} 는 active row 기준 유일성 보장
 * (unique INDEX on partner_code WHERE is_deleted = false).
 *
 * <p>BaseEntity 7 audit + Soft Delete ({@link BaseEntity#markDeleted()}).
 */
@Entity
@Getter
@Table(name = "tax_invoice_batch_exclusions")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class TaxInvoiceBatchExclusion extends BaseEntity {

    /** PK — UUID v4 자동 생성. */
    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /**
     * 거래처 코드 — 사용자 노출 식별자 (UUID 비공개 원칙 준수).
     * active row 기준 unique (partial index).
     */
    @Column(name = "partner_code", nullable = false, length = 50)
    private String partnerCode;

    /** 거래처 명칭 스냅샷 (등록 시점). */
    @Column(name = "partner_name", length = 100)
    private String partnerName;

    /** 제외 사유 (자유 텍스트). */
    @Column(name = "reason", columnDefinition = "TEXT")
    private String reason;

    /**
     * 제외 거래처 등록.
     *
     * @param partnerCode  거래처 코드 (필수)
     * @param partnerName  거래처 명칭 스냅샷 (nullable)
     * @param reason       제외 사유 (nullable)
     * @return 신규 {@link TaxInvoiceBatchExclusion}
     */
    public static TaxInvoiceBatchExclusion create(String partnerCode, String partnerName,
                                                   String reason) {
        if (partnerCode == null || partnerCode.isBlank()) {
            throw new IllegalArgumentException("partnerCode 는 필수입니다");
        }
        TaxInvoiceBatchExclusion ex = new TaxInvoiceBatchExclusion();
        ex.partnerCode = partnerCode.trim();
        ex.partnerName = partnerName;
        ex.reason = reason;
        return ex;
    }
}
