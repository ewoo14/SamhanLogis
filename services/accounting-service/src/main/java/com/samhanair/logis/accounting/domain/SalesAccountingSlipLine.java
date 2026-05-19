package com.samhanair.logis.accounting.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 매출전표 라인 — 전표 1건에 속하는 품목 단위 명세.
 *
 * <p>spec: 2026-05-19-sales-purchase-accounting-slip-design.md §3-B
 */
@Entity
@Getter
@Table(name = "sales_accounting_slip_lines",
       uniqueConstraints = @UniqueConstraint(columnNames = {"slip_id", "line_no"}))
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class SalesAccountingSlipLine extends BaseEntity {

    @Id @GeneratedValue @UuidGenerator
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "slip_id", nullable = false)
    private SalesAccountingSlip slip;

    @Column(name = "line_no", nullable = false)
    private int lineNo;

    @Column(name = "product_code", length = 100) private String productCode;
    @Column(name = "product_name", length = 200) private String productName;

    @Column(name = "qty", nullable = false, precision = 12, scale = 3)
    private BigDecimal qty;
    @Column(name = "unit_price", nullable = false, precision = 15, scale = 2)
    private BigDecimal unitPrice;
    @Column(name = "supply_amount", nullable = false, precision = 15, scale = 2)
    private BigDecimal supplyAmount;
    @Column(name = "vat_amount", nullable = false, precision = 15, scale = 2)
    private BigDecimal vatAmount;
    @Column(name = "line_total", nullable = false, precision = 15, scale = 2)
    private BigDecimal lineTotal;

    @OneToMany(mappedBy = "salesSlipLine", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<SalesAccountingSlipAllocation> allocations = new ArrayList<>();

    public static SalesAccountingSlipLine create(SalesAccountingSlip slip, int lineNo,
            String productCode, String productName,
            BigDecimal qty, BigDecimal unitPrice,
            BigDecimal supplyAmount, BigDecimal vatAmount, BigDecimal lineTotal) {
        SalesAccountingSlipLine l = new SalesAccountingSlipLine();
        l.slip = slip;
        l.lineNo = lineNo;
        l.productCode = productCode;
        l.productName = productName;
        l.qty = qty;
        l.unitPrice = unitPrice;
        l.supplyAmount = supplyAmount;
        l.vatAmount = vatAmount;
        l.lineTotal = lineTotal;
        return l;
    }
}
