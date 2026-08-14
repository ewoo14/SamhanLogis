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
 * 출고전표 라인 ↔ 출고전표 라인 N:M 배분 연결.
 *
 * <p>spec: 2026-05-19-sales-purchase-accounting-slip-design.md §3-C
 */
@Entity
@Getter
@Table(name = "sales_accounting_slip_allocations")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class SalesAccountingSlipAllocation extends BaseEntity {

    @Id @GeneratedValue @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sales_slip_line_id", nullable = false)
    private SalesAccountingSlipLine salesSlipLine;

    @Column(name = "source_slip_id", nullable = false) private UUID sourceSlipId;
    @Column(name = "source_slip_no", nullable = false, length = 50) private String sourceSlipNo;
    @Column(name = "source_line_id", nullable = false) private UUID sourceLineId;
    @Column(name = "source_line_no", nullable = false) private int sourceLineNo;
    @Column(name = "model_name", length = 100) private String modelName;
    @Column(name = "category_key", length = 40) private String categoryKey;
    @Column(name = "allocated_qty", nullable = false, precision = 12, scale = 3) private BigDecimal allocatedQty;
    @Column(name = "allocated_amount", nullable = false, precision = 15, scale = 2) private BigDecimal allocatedAmount;

    public static SalesAccountingSlipAllocation create(SalesAccountingSlipLine line,
            UUID sourceSlipId, String sourceSlipNo, UUID sourceLineId, int sourceLineNo,
            BigDecimal allocatedQty, BigDecimal allocatedAmount) {
        return create(line, sourceSlipId, sourceSlipNo, sourceLineId, sourceLineNo,
                allocatedQty, allocatedAmount, null, null);
    }

    /** 원천 출고전표 라인의 모델명·GAS 카테고리 축을 배분 snapshot에 보존한다. */
    public static SalesAccountingSlipAllocation create(SalesAccountingSlipLine line,
            UUID sourceSlipId, String sourceSlipNo, UUID sourceLineId, int sourceLineNo,
            BigDecimal allocatedQty, BigDecimal allocatedAmount,
            String modelName, String categoryKey) {
        SalesAccountingSlipAllocation a = new SalesAccountingSlipAllocation();
        a.salesSlipLine = line;
        a.sourceSlipId = sourceSlipId;
        a.sourceSlipNo = sourceSlipNo;
        a.sourceLineId = sourceLineId;
        a.sourceLineNo = sourceLineNo;
        a.modelName = modelName;
        a.categoryKey = categoryKey;
        a.allocatedQty = allocatedQty;
        a.allocatedAmount = allocatedAmount;
        return a;
    }
}
