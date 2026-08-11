package com.samhanair.logis.accounting.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.Objects;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/** 영업수수료 정산에 사용하는 불변 요율 계약의 버전. */
@Entity
@Getter
@Table(name = "sales_commission_rate_contracts")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class SalesCommissionRateContract extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "version_no", nullable = false)
    private int versionNo;

    @Column(name = "card_rate", nullable = false, precision = 19, scale = 8)
    private BigDecimal cardRate;

    @Column(name = "expense_rate", nullable = false, precision = 19, scale = 8)
    private BigDecimal expenseRate;

    @Column(name = "withholding_rate", nullable = false, precision = 19, scale = 8)
    private BigDecimal withholdingRate;

    @Column(name = "install_rate", nullable = false, precision = 19, scale = 8)
    private BigDecimal installRate;

    private SalesCommissionRateContract(int versionNo, BigDecimal cardRate, BigDecimal expenseRate,
                                        BigDecimal withholdingRate, BigDecimal installRate) {
        if (versionNo <= 0) {
            throw new IllegalArgumentException("요율 계약 버전은 양수여야 합니다");
        }
        this.versionNo = versionNo;
        this.cardRate = requireRate(cardRate, "cardRate");
        this.expenseRate = requireRate(expenseRate, "expenseRate");
        this.withholdingRate = requireRate(withholdingRate, "withholdingRate");
        this.installRate = requireRate(installRate, "installRate");
    }

    /** 새로운 요율 계약 버전을 만든다. 기존 계약을 수정하지 않고 새 행으로 저장해야 한다. */
    public static SalesCommissionRateContract create(int versionNo, BigDecimal cardRate,
                                                       BigDecimal expenseRate,
                                                       BigDecimal withholdingRate,
                                                       BigDecimal installRate) {
        return new SalesCommissionRateContract(versionNo, cardRate, expenseRate,
                withholdingRate, installRate);
    }

    private static BigDecimal requireRate(BigDecimal value, String name) {
        return Objects.requireNonNull(value, name + " 는 필수입니다");
    }
}
