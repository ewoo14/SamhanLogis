package com.samhanair.logis.product.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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

/** 수량 동기화 규칙의 target Product 결과 행. */
@Entity
@Getter
@Table(name = "quantity_sync_target")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class QuantitySyncTarget extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "rule_id", nullable = false)
    private UUID ruleId;

    @Column(name = "target_product_id", nullable = false)
    private UUID targetProductId;

    @Column(name = "multiplier", nullable = false)
    private BigDecimal multiplier;

    @Enumerated(EnumType.STRING)
    @Column(name = "rounding_mode", nullable = false, length = 16)
    private QuantitySyncRoundingMode roundingMode;

    @Column(name = "component_variant", length = 32)
    private String componentVariant;

    @Column(name = "component_shape", length = 16)
    private String componentShape;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    private QuantitySyncTarget(UUID ruleId, UUID targetProductId, BigDecimal multiplier,
                               QuantitySyncRoundingMode roundingMode, String componentVariant,
                               String componentShape, int displayOrder) {
        this.ruleId = ruleId;
        this.targetProductId = targetProductId;
        this.multiplier = multiplier;
        this.roundingMode = roundingMode;
        this.componentVariant = blankToNull(componentVariant);
        this.componentShape = blankToNull(componentShape);
        this.displayOrder = displayOrder;
    }

    /** target Product 내부 FK와 결과 배수로 신규 행을 만든다. */
    public static QuantitySyncTarget create(UUID ruleId, UUID targetProductId, BigDecimal multiplier,
                                            QuantitySyncRoundingMode roundingMode, int displayOrder) {
        return create(ruleId, targetProductId, multiplier, roundingMode, null, null, displayOrder);
    }

    /** target 결과 배수와 구성품 선택 메타데이터로 신규 행을 만든다. */
    public static QuantitySyncTarget create(UUID ruleId, UUID targetProductId, BigDecimal multiplier,
                                            QuantitySyncRoundingMode roundingMode,
                                            String componentVariant, String componentShape,
                                            int displayOrder) {
        if (ruleId == null || targetProductId == null) throw new IllegalArgumentException("target 식별자 필수");
        if (multiplier == null) throw new IllegalArgumentException("multiplier 필수");
        if (roundingMode == null) throw new IllegalArgumentException("roundingMode 필수");
        if (displayOrder < 1) throw new IllegalArgumentException("displayOrder는 1 이상");
        return new QuantitySyncTarget(ruleId, targetProductId, multiplier, roundingMode,
                componentVariant, componentShape, displayOrder);
    }

    /** target 결과 배수와 표시 메타데이터를 교체한다. */
    public void changeDefinition(BigDecimal multiplier, QuantitySyncRoundingMode roundingMode,
                                 int displayOrder) {
        changeDefinition(multiplier, roundingMode, null, null, displayOrder);
    }

    /** target 결과 배수와 구성품 선택 메타데이터를 교체한다. */
    public void changeDefinition(BigDecimal multiplier, QuantitySyncRoundingMode roundingMode,
                                 String componentVariant, String componentShape, int displayOrder) {
        this.multiplier = multiplier;
        this.roundingMode = roundingMode;
        this.componentVariant = blankToNull(componentVariant);
        this.componentShape = blankToNull(componentShape);
        this.displayOrder = displayOrder;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
