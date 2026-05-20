package com.samhanair.logis.accounting.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/** MIG-8 이카운트 주문서 기반 주문 도메인. */
@Entity
@Getter
@Table(name = "orders")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class Order extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "order_no", nullable = false, length = 30)
    private String orderNo;

    @Column(name = "partner_id", nullable = false)
    private UUID partnerId;

    @Column(name = "partner_name", nullable = false, length = 200)
    private String partnerName;

    @Column(name = "manager_name", length = 100)
    private String managerName;

    @Column(name = "manager_employee_id")
    private UUID managerEmployeeId;

    @Column(name = "valid_until")
    private LocalDate validUntil;

    @Column(name = "payment_terms", columnDefinition = "TEXT")
    private String paymentTerms;

    @Column(name = "reference", columnDefinition = "TEXT")
    private String reference;

    @Enumerated(EnumType.STRING)
    @Column(name = "progress_status", nullable = false, length = 20)
    private OrderProgressStatus progressStatus;

    @Column(name = "total_supply_amount", nullable = false, precision = 15, scale = 2)
    private BigDecimal totalSupplyAmount;

    @Column(name = "total_vat_amount", nullable = false, precision = 15, scale = 2)
    private BigDecimal totalVatAmount;

    @Column(name = "linked_slip_no", length = 30)
    private String linkedSlipNo;

    @Column(name = "external_ref", nullable = false, length = 100)
    private String externalRef;

    @Column(name = "kind", nullable = false, length = 20)
    private String kind;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<OrderLine> lines = new ArrayList<>();

    public static Order fromMig8Staging(String orderNo, UUID partnerId, String partnerName,
                                        String managerName, LocalDate validUntil,
                                        String paymentTerms, String reference,
                                        OrderProgressStatus progressStatus, String externalRef) {
        Order order = new Order();
        order.orderNo = orderNo;
        order.partnerId = partnerId;
        order.partnerName = partnerName;
        order.managerName = managerName;
        order.validUntil = validUntil;
        order.paymentTerms = paymentTerms;
        order.reference = reference;
        order.progressStatus = progressStatus;
        order.totalSupplyAmount = BigDecimal.ZERO;
        order.totalVatAmount = BigDecimal.ZERO;
        order.externalRef = externalRef;
        order.kind = "ECOUNT_MIG8";
        return order;
    }

    public void addLine(int lineNo, UUID productId, String itemName, BigDecimal quantity,
                        BigDecimal unitPrice, BigDecimal supplyAmount, BigDecimal vatAmount,
                        LocalDate itemDueDate) {
        OrderLine line = OrderLine.fromMig8Staging(this, lineNo, productId, itemName, quantity,
                unitPrice, supplyAmount, vatAmount, itemDueDate);
        lines.add(line);
        recalcTotals();
    }

    public void linkSalesSlip(String slipNo) {
        this.linkedSlipNo = slipNo;
    }

    private void recalcTotals() {
        this.totalSupplyAmount = lines.stream()
                .map(OrderLine::getSupplyAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        this.totalVatAmount = lines.stream()
                .map(OrderLine::getVatAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }
}
