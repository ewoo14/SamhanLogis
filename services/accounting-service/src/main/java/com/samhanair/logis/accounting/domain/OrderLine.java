package com.samhanair.logis.accounting.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/** MIG-8 이카운트 주문서 품목 라인. */
@Entity
@Getter
@Table(name = "order_lines")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class OrderLine extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_id", nullable = false)
    private Order order;

    @Column(name = "line_no", nullable = false)
    private int lineNo;

    @Column(name = "product_id")
    private UUID productId;

    @Column(name = "item_name", nullable = false, length = 200)
    private String itemName;

    @Column(name = "quantity", nullable = false, precision = 15, scale = 3)
    private BigDecimal quantity;

    @Column(name = "unit_price", nullable = false, precision = 15, scale = 2)
    private BigDecimal unitPrice;

    @Column(name = "supply_amount", nullable = false, precision = 15, scale = 2)
    private BigDecimal supplyAmount;

    @Column(name = "vat_amount", nullable = false, precision = 15, scale = 2)
    private BigDecimal vatAmount;

    @Column(name = "item_due_date")
    private LocalDate itemDueDate;

    static OrderLine fromMig8Staging(Order order, int lineNo, UUID productId, String itemName,
                                     BigDecimal quantity, BigDecimal unitPrice,
                                     BigDecimal supplyAmount, BigDecimal vatAmount,
                                     LocalDate itemDueDate) {
        OrderLine line = new OrderLine();
        line.order = order;
        line.lineNo = lineNo;
        line.productId = productId;
        line.itemName = itemName;
        line.quantity = quantity;
        line.unitPrice = unitPrice;
        line.supplyAmount = supplyAmount;
        line.vatAmount = vatAmount;
        line.itemDueDate = itemDueDate;
        return line;
    }
}
