package com.samhanair.logis.accounting.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 매출전표 (회계 분개) — 출고전표 source 와 N:M 매핑.
 *
 * <p>spec: 2026-05-19-sales-purchase-accounting-slip-design.md §3-A
 */
@Entity
@Getter
@Table(name = "sales_accounting_slips")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class SalesAccountingSlip extends BaseEntity {

    @Id @GeneratedValue @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "slip_no", nullable = false, unique = true, length = 50)
    private String slipNo;

    @Column(name = "slip_date", nullable = false)
    private LocalDate slipDate;

    @Column(name = "partner_id", nullable = false)
    private UUID partnerId;

    @Column(name = "partner_code", nullable = false, length = 100)
    private String partnerCode;

    @Column(name = "partner_name", nullable = false, length = 200)
    private String partnerName;

    @Enumerated(EnumType.STRING)
    @Column(name = "tax_type", nullable = false, length = 20)
    private SalesTaxType taxType;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private SalesSlipStatus status;

    @Column(name = "total_supply_amount", nullable = false, precision = 15, scale = 2)
    private BigDecimal totalSupplyAmount;

    @Column(name = "total_vat_amount", nullable = false, precision = 15, scale = 2)
    private BigDecimal totalVatAmount;

    @Column(name = "total_amount", nullable = false, precision = 15, scale = 2)
    private BigDecimal totalAmount;

    @Column(name = "posted_at") private LocalDateTime postedAt;
    @Column(name = "posted_by", length = 100) private String postedBy;
    @Column(name = "tax_invoice_id") private UUID taxInvoiceId;
    @Column(name = "memo", columnDefinition = "TEXT") private String memo;

    @OneToMany(mappedBy = "slip", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<SalesAccountingSlipLine> lines = new ArrayList<>();

    public static SalesAccountingSlip createDraft(String slipNo, LocalDate slipDate,
            UUID partnerId, String partnerCode, String partnerName,
            SalesTaxType taxType, String memo) {
        SalesAccountingSlip s = new SalesAccountingSlip();
        s.slipNo = slipNo;
        s.slipDate = slipDate;
        s.partnerId = partnerId;
        s.partnerCode = partnerCode;
        s.partnerName = partnerName;
        s.taxType = taxType;
        s.status = SalesSlipStatus.DRAFT;
        s.totalSupplyAmount = BigDecimal.ZERO;
        s.totalVatAmount = BigDecimal.ZERO;
        s.totalAmount = BigDecimal.ZERO;
        s.memo = memo;
        return s;
    }

    public void recalcTotals() {
        this.totalSupplyAmount = lines.stream().map(SalesAccountingSlipLine::getSupplyAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        this.totalVatAmount = lines.stream().map(SalesAccountingSlipLine::getVatAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        this.totalAmount = totalSupplyAmount.add(totalVatAmount);
    }

    public void post(String actorUserId) {
        if (this.status != SalesSlipStatus.DRAFT) {
            throw new BusinessException(ErrorCode.SAS_ALREADY_POSTED,
                    "DRAFT 상태에서만 POST 가능: " + slipNo + " (현재=" + status + ")");
        }
        this.status = SalesSlipStatus.POSTED;
        this.postedAt = LocalDateTime.now();
        this.postedBy = actorUserId;
    }

    public void voidSlip(String actorUserId) {
        if (this.status == SalesSlipStatus.VOIDED) return;
        this.status = SalesSlipStatus.VOIDED;
    }

    public void linkTaxInvoice(UUID taxInvoiceId) {
        if (this.taxInvoiceId != null) {
            throw new BusinessException(ErrorCode.SAS_TAX_INVOICE_ALREADY_LINKED,
                    "이미 세금계산서와 매핑됨: " + slipNo);
        }
        this.taxInvoiceId = taxInvoiceId;
    }
}
