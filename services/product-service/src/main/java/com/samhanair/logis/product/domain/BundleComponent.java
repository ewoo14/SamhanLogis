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

/**
 * BUNDLE 부모 ↔ component 1:N — 싱글 구성품 / 상업멀티 구성 시트의 sub-product 라인.
 *
 * <p>출처: Migration Plan §2.1.3. 싱글 구성품 282 부모 + 1455 component / 상업멀티 구성
 * 86 부모 + ~430 component → 합계 368 부모 + 1885 component.
 *
 * <p>qtyMode: 시트 sync 는 전부 FOLLOW_SET 로 적재('Q'→defaultQty 1, 숫자 N→defaultQty N) — 전개 시
 * setQty 비례(legacy explodeCommSets_). FIXED 는 도메인 능력으로 보존(sync 미생성).
 */
@Entity
@Getter
@Table(name = "bundle_component")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class BundleComponent extends BaseEntity {

    public enum QtyMode {FIXED, FOLLOW_SET}

    public enum ComponentKind {INDOOR, OUTDOOR, PANEL, REMOTE, MATERIAL, ACCESSORY, FOOT}

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 부모 BUNDLE ProductMaster.id. */
    @Column(name = "bundle_product_id", nullable = false)
    private UUID bundleProductId;

    /** sub-product modelCode (FK to ProductMaster.modelCode). */
    @Column(name = "component_product_code", nullable = false, length = 64)
    private String componentProductCode;

    @Column(name = "default_qty", nullable = false, precision = 5, scale = 2)
    private BigDecimal defaultQty;

    @Enumerated(EnumType.STRING)
    @Column(name = "qty_mode", nullable = false, length = 16)
    private QtyMode qtyMode;

    /** 싱글 구성품 D열 구분. */
    @Enumerated(EnumType.STRING)
    @Column(name = "component_kind", nullable = false, length = 16)
    private ComponentKind componentKind;

    /** 싱글 구성품 N열 구성품 특징 (기본/사각/WIFI 등). */
    @Column(name = "component_variant", length = 64)
    private String componentVariant;

    /** componentVariant ~ /기본/. */
    @Column(name = "is_default", nullable = false)
    private Boolean isDefault = Boolean.FALSE;

    /** 시트 L열 규격. */
    @Column(name = "spec_text", length = 255)
    private String specText;

    private BundleComponent(UUID bundleProductId, String componentProductCode,
                            BigDecimal defaultQty, QtyMode qtyMode, ComponentKind componentKind,
                            String componentVariant, boolean isDefault, String specText) {
        this.bundleProductId = bundleProductId;
        this.componentProductCode = componentProductCode;
        this.defaultQty = defaultQty;
        this.qtyMode = qtyMode;
        this.componentKind = componentKind;
        this.componentVariant = componentVariant;
        this.isDefault = isDefault;
        this.specText = specText;
    }

    public static BundleComponent seed(UUID bundleProductId, String componentProductCode,
                                       BigDecimal defaultQty, QtyMode qtyMode,
                                       ComponentKind componentKind, String componentVariant,
                                       boolean isDefault, String specText) {
        if (bundleProductId == null) throw new IllegalArgumentException("bundleProductId 필수");
        if (componentProductCode == null || componentProductCode.isBlank())
            throw new IllegalArgumentException("componentProductCode 필수");
        return new BundleComponent(bundleProductId, componentProductCode,
                defaultQty == null ? BigDecimal.ONE : defaultQty,
                qtyMode == null ? QtyMode.FIXED : qtyMode,
                componentKind == null ? ComponentKind.ACCESSORY : componentKind,
                componentVariant, isDefault, specText);
    }

    /**
     * 시트 sync 멱등 갱신 — 부모/자식코드(natural key) 동일 행의 속성 재적재.
     * bundleProductId / componentProductCode 는 식별자이므로 변경하지 않는다.
     */
    public void changeAttributes(BigDecimal defaultQty, QtyMode qtyMode, ComponentKind componentKind,
                                 String componentVariant, boolean isDefault, String specText) {
        this.defaultQty = defaultQty == null ? BigDecimal.ONE : defaultQty;
        this.qtyMode = qtyMode == null ? QtyMode.FIXED : qtyMode;
        this.componentKind = componentKind == null ? ComponentKind.ACCESSORY : componentKind;
        this.componentVariant = componentVariant;
        this.isDefault = isDefault;
        this.specText = specText;
    }
}
