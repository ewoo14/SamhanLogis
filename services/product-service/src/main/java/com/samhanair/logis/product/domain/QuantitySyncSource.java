package com.samhanair.logis.product.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/** 수량 동기화 규칙의 source Product 기여 행. */
@Entity
@Getter
@Table(name = "quantity_sync_source")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class QuantitySyncSource extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "rule_id", nullable = false)
    private UUID ruleId;

    @Column(name = "source_product_id", nullable = false)
    private UUID sourceProductId;

    @Column(name = "factor", nullable = false)
    private BigDecimal factor;

    private QuantitySyncSource(UUID ruleId, UUID sourceProductId, BigDecimal factor) {
        this.ruleId = ruleId;
        this.sourceProductId = sourceProductId;
        this.factor = factor;
    }

    /** source Product 내부 FK와 기여 배수로 신규 행을 만든다. */
    public static QuantitySyncSource create(UUID ruleId, UUID sourceProductId, BigDecimal factor) {
        if (ruleId == null || sourceProductId == null) throw new IllegalArgumentException("source 식별자 필수");
        if (factor == null) throw new IllegalArgumentException("factor 필수");
        return new QuantitySyncSource(ruleId, sourceProductId, factor);
    }

    /** source 기여 배수를 교체한다. */
    public void changeFactor(BigDecimal factor) {
        if (factor == null) throw new IllegalArgumentException("factor 필수");
        this.factor = factor;
    }
}
