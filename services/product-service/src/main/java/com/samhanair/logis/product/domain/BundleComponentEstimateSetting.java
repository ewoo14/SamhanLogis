package com.samhanair.logis.product.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/** 견적 카테고리별 구성품의 수량동기화·옵션·품목구분 설정. 웹 노출 행과 분리한다. */
@Entity
@Getter
@Table(name = "bundle_component_estimate_setting")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class BundleComponentEstimateSetting extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "bundle_component_id", nullable = false)
    private UUID bundleComponentId;

    @Enumerated(EnumType.STRING)
    @Column(name = "estimate_category", nullable = false, length = 20)
    private EstimateCategory estimateCategory;

    @Enumerated(EnumType.STRING)
    @Column(name = "qty_mode", nullable = false, length = 16)
    private BundleComponent.QtyMode qtyMode;

    @Enumerated(EnumType.STRING)
    @Column(name = "component_kind", nullable = false, length = 16)
    private BundleComponent.ComponentKind componentKind;

    @Column(name = "component_variant", length = 64)
    private String componentVariant;

    @Column(name = "component_shape", length = 16)
    private String componentShape;

    @Column(name = "is_default", nullable = false)
    private boolean isDefault;

    @Column(name = "source_display_order")
    private Integer sourceDisplayOrder;

    @Column(name = "configuration_only", nullable = false)
    private boolean configurationOnly = true;

    public static BundleComponentEstimateSetting create(UUID bundleComponentId,
                                                        EstimateCategory estimateCategory,
                                                        BundleComponent.QtyMode qtyMode,
                                                        BundleComponent.ComponentKind componentKind,
                                                        String componentVariant, String componentShape,
                                                        boolean isDefault, Integer sourceDisplayOrder) {
        BundleComponentEstimateSetting setting = new BundleComponentEstimateSetting();
        setting.bundleComponentId = bundleComponentId;
        setting.estimateCategory = estimateCategory;
        setting.qtyMode = qtyMode;
        setting.componentKind = componentKind;
        setting.componentVariant = componentVariant;
        setting.componentShape = componentShape;
        setting.isDefault = isDefault;
        setting.sourceDisplayOrder = sourceDisplayOrder;
        setting.configurationOnly = true;
        return setting;
    }

    public void change(BundleComponent.QtyMode qtyMode,
                       BundleComponent.ComponentKind componentKind,
                       String componentVariant, String componentShape,
                       boolean isDefault) {
        this.qtyMode = qtyMode;
        this.componentKind = componentKind;
        this.componentVariant = componentVariant;
        this.componentShape = componentShape;
        this.isDefault = isDefault;
    }
}
