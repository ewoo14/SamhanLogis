package com.samhanair.logis.accounting.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 입고전표 라인 ↔ 입고전표 라인 N:M 배분 연결.
 *
 * <p>spec: 2026-05-19-sales-purchase-accounting-slip-design.md §3-C
 */
@Entity
@Getter
@Table(name = "purchase_accounting_slip_allocations")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class PurchaseAccountingSlipAllocation extends BaseEntity {

    @Id @GeneratedValue @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "purchase_slip_line_id", nullable = false)
    private PurchaseAccountingSlipLine purchaseSlipLine;

    @Column(name = "source_slip_id", nullable = false) private UUID sourceSlipId;
    @Column(name = "source_slip_no", nullable = false, length = 50) private String sourceSlipNo;
    @Column(name = "source_line_id", nullable = false) private UUID sourceLineId;
    @Column(name = "source_line_no", nullable = false) private int sourceLineNo;
    @Column(name = "allocated_qty", nullable = false, precision = 12, scale = 3) private BigDecimal allocatedQty;
    @Column(name = "allocated_amount", nullable = false, precision = 15, scale = 2) private BigDecimal allocatedAmount;

    public static PurchaseAccountingSlipAllocation create(PurchaseAccountingSlipLine line,
            UUID sourceSlipId, String sourceSlipNo, UUID sourceLineId, int sourceLineNo,
            BigDecimal allocatedQty, BigDecimal allocatedAmount) {
        PurchaseAccountingSlipAllocation a = new PurchaseAccountingSlipAllocation();
        a.purchaseSlipLine = line;
        a.sourceSlipId = sourceSlipId;
        a.sourceSlipNo = sourceSlipNo;
        a.sourceLineId = sourceLineId;
        a.sourceLineNo = sourceLineNo;
        a.allocatedQty = allocatedQty;
        a.allocatedAmount = allocatedAmount;
        return a;
    }
}
