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

    /** #1143 구성품 가격 배분 방식. */
    public enum AllocationMode {AUTO, FIXED}

    public enum ComponentKind {
        INDOOR(0),
        OUTDOOR(1),
        PANEL(2),
        REMOTE(3),
        MATERIAL(4),
        ACCESSORY(5),
        FOOT(6);

        private final int rank;

        ComponentKind(int rank) {
            this.rank = rank;
        }

        /**
         * 세트 구성품 표시 순서 정규화를 위한 고정 종류 순위.
         *
         * <p>사용자 드래그는 종류 내부 순서만 표현하며, 서버는 이 순위로
         * 실내기→실외기→판넬→리모컨→자재→부속→받침대 구조를 보장한다.
         *
         * @return 낮을수록 먼저 표시되는 종류 순위
         */
        public int rank() {
            return rank;
        }
    }

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

    /** 형상 자체가 360 판넬 여부의 정의다. 빈 값이면 360 판넬이 아니다. */
    @Column(name = "component_shape", length = 16)
    private String componentShape;

    /** componentVariant ~ /기본/. */
    @Column(name = "is_default", nullable = false)
    private Boolean isDefault = Boolean.FALSE;

    /** 시트 L열 규격. */
    @Column(name = "spec_text", length = 255)
    private String specText;

    /**
     * 표시 순서 (§2-4 2026-06-11). NULL 허용 — 기존 행 backfill 미완 시 ORDER BY NULLS LAST 처리.
     * replace-all 저장 시 서버 정규화 순위(종류순 + 종류 내 기본 먼저 + incoming index) 를 기록한다.
     * 시트 sync 적재 시에는 설정하지 않는다 (NULL = sync 미설정 행).
     */
    @Column(name = "display_order")
    private Integer displayOrder;

    @Enumerated(EnumType.STRING)
    @Column(name = "allocation_mode", nullable = false, length = 8)
    private AllocationMode allocationMode = AllocationMode.FIXED;

    @Column(name = "allocation_weight")
    private Integer allocationWeight;

    @Column(name = "fixed_allocation_amount", precision = 19, scale = 2)
    private BigDecimal fixedAllocationAmount;

    /** 세트 문맥 구성품 출고가. NULL이면 전역 가격으로 fallback한다. */
    @Column(name = "context_release_price", precision = 19, scale = 2)
    private BigDecimal contextReleasePrice;

    /** 세트 문맥 구성품 납품가. NULL이면 전역 납품가로 fallback한다. */
    @Column(name = "context_delivery_price", precision = 19, scale = 2)
    private BigDecimal contextDeliveryPrice;

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

    public static BundleComponent seed(UUID bundleProductId, String componentProductCode,
                                       BigDecimal defaultQty, QtyMode qtyMode,
                                       ComponentKind componentKind, String componentVariant,
                                       String componentShape, boolean isDefault, String specText) {
        BundleComponent component = seed(bundleProductId, componentProductCode, defaultQty, qtyMode,
                componentKind, componentVariant, isDefault, specText);
        component.changeShape(componentShape);
        return component;
    }

    public void changeShape(String componentShape) {
        this.componentShape = componentShape == null || componentShape.isBlank() ? null : componentShape;
    }

    /**
     * 표시 순서 갱신 — replace-all 저장 시 서버 정규화 순위(1-based) 를 주입.
     *
     * @param displayOrder 1-based 표시 순서
     */
    public void changeDisplayOrder(int displayOrder) {
        this.displayOrder = displayOrder;
    }

    public void changeAllocation(AllocationMode mode, Integer weight, BigDecimal fixedAmount) {
        this.allocationMode = mode == null ? AllocationMode.FIXED : mode;
        this.allocationWeight = weight;
        this.fixedAllocationAmount = fixedAmount;
    }

    /** 시트의 부모 세트 문맥 출고가·납품가를 저장한다. */
    public void changeContextPrices(BigDecimal releasePrice, BigDecimal deliveryPrice) {
        this.contextReleasePrice = releasePrice;
        this.contextDeliveryPrice = deliveryPrice;
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
