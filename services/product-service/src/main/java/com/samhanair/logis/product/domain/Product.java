package com.samhanair.logis.product.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

/**
 * 제품 마스터 (ProductMaster) — Phase 6 M1a 확장 (시트 27탭 → 8 entity 시드).
 *
 * <p>본 entity 는 V1 의 단순 product 도메인을 확장하여 legacy Apps Script 시트의
 * 모든 마스터 컬럼 (변동DC + Bundle + 노출 분류 + 동적 스펙 + 가격 history) 을 보유한다.
 *
 * <p><b>출처</b>:
 * <ul>
 *     <li>Migration Plan §2.1.1 — ProductMaster 확장 10 컬럼</li>
 *     <li>DOMAIN-EXTENSIONS §1 — 변동DC 4 컬럼 (hasVariableDiscount/fixedDiscountRate/setMaterialKey/legacyDiscountFlag)</li>
 *     <li>DOMAIN-EXTENSIONS §2 — Bundle 2 컬럼 (productType/bundleMode)</li>
 *     <li>DOMAIN-EXTENSIONS §3 — 노출 범위 usageScope + 견적 노출 M:N</li>
 *     <li>DOMAIN-EXTENSIONS §4 — 동적 스펙은 별도 {@code ProductSpec} 1:N</li>
 * </ul>
 *
 * <p>Soft-delete via {@link SQLRestriction}; 단종은 별도 {@link ProductStatus} enum 으로 직교 운용.
 * 사용자 노출 식별자는 {@code modelCode} (UUID 비공개 원칙 — feedback_uuid_no_user_visibility.md).
 */
@Entity
@Getter
@Table(name = "products")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class Product extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "name", nullable = false, length = 150)
    private String name;

    @Column(name = "model_name", nullable = false, length = 100)
    private String modelName;

    /**
     * 사용자 노출 식별자 — 시트 B열 모델명 정규화. UUID 비공개 원칙 충족
     * (feedback_uuid_no_user_visibility.md). V3 마이그에서 추가된 신규 컬럼.
     */
    @Column(name = "model_code", length = 100)
    private String modelCode;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "category_id", nullable = false)
    private Category category;

    /** 생성 경로. 관리자 편집에서는 변경하지 않으며, ECOUNT 행이 시트 정본으로 채택될 때만 승격한다. */
    @jakarta.persistence.Enumerated(jakarta.persistence.EnumType.STRING)
    @jakarta.persistence.Column(name = "lineage", nullable = false, length = 20)
    private ProductLineage lineage = ProductLineage.MANUAL;

    @Column(name = "selling_price", nullable = false, precision = 15, scale = 2)
    private BigDecimal sellingPrice;

    @Column(name = "purchase_price", nullable = false, precision = 15, scale = 2)
    private BigDecimal purchasePrice;

    @Column(name = "currency", nullable = false, length = 3)
    private String currency;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private ProductStatus status;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "tags", columnDefinition = "jsonb")
    private Map<String, String> tags;

    @Column(name = "description", length = 1000)
    private String description;

    // ============================================================
    // V3 마이그 신규 컬럼 (DOMAIN-EXTENSIONS §1~§4)
    // ============================================================

    /** DOMAIN-EXTENSIONS §2 — 단일 vs 세트 분기. */
    @Enumerated(EnumType.STRING)
    @Column(name = "product_type", nullable = false, length = 16)
    private ProductType productType = ProductType.SINGLE;

    /** DOMAIN-EXTENSIONS §2 — BUNDLE 인 경우만 (EXPAND/KEEP). */
    @Enumerated(EnumType.STRING)
    @Column(name = "bundle_mode", length = 16)
    private BundleMode bundleMode;

    /** DOMAIN-EXTENSIONS §1 — 룰 1 ($L$2 절대참조 발견 시 TRUE). */
    @Column(name = "has_variable_discount", nullable = false)
    private Boolean hasVariableDiscount = Boolean.FALSE;

    /** DOMAIN-EXTENSIONS §1 — 룰 3 (구형 50%) 또는 행별 고정DC L 컬럼. */
    @Column(name = "fixed_discount_rate", precision = 5, scale = 2)
    private BigDecimal fixedDiscountRate;

    /** F1-a 견적 품목 대분류. 카테고리별 Classification 마스터를 참조한다. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "cat_l_id")
    private Classification catL;

    /** F1-a 견적 품목 중분류. {@code catL} 의 자식 Classification 을 참조한다. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "cat_m_id")
    private Classification catM;

    /** F1-a 견적 품목 소분류. {@code catM} 의 자식 Classification 을 참조한다. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "cat_s_id")
    private Classification catS;

    /** DOMAIN-EXTENSIONS §1 — 룰 2 (D4 default / D7 미포함 / D8 포함) — 싱글 세트만. */
    @Enumerated(EnumType.STRING)
    @Column(name = "set_material_key", length = 2)
    private MaterialKey setMaterialKey;

    /** DOMAIN-EXTENSIONS §1 — 구형 시트 41 row TRUE. */
    @Column(name = "legacy_discount_flag", nullable = false)
    private Boolean legacyDiscountFlag = Boolean.FALSE;

    /**
     * DOMAIN-EXTENSIONS §1 + getModelFlags 7 prefix 정규식 — 6-bit bitset
     * (is360/is4way/is1way/isStand/isDeluxe/isGrade1). 0/1 char 6 자리 문자열.
     */
    @Column(name = "discount_flags", nullable = false, length = 20)
    private String discountFlags = "000000";

    /**
     * 변동DC 수동 override 플래그(V19, 2026-06-17).
     *
     * <p>{@code true} 이면 {@link com.samhanair.logis.product.service.ProductSheetSyncService}
     * upsert 경로에서 {@code hasVariableDiscount} 및 변동DC 부속 필드를 시트 기준으로 덮어쓰지 않는다.
     *
     * <p>초기값 {@code false} — 기존 row 는 전부 시트 자동 적재 상태.
     * {@link #markVariableDiscountManual(boolean)} 로 {@code true} 전환,
     * {@link #clearVariableDiscountManual()} 로 {@code false} 복귀 (다음 sync 에서 시트 기준 재적재).
     */
    @Column(name = "variable_discount_manual", nullable = false)
    private boolean variableDiscountManual = false;

    /**
     * F1-a 분류 수동 override 플래그.
     *
     * <p>{@code true} 이면 시트 sync 가 품명 정규식 기본 분류로 {@code catL/M/S} 를 덮어쓰지 않는다.
     */
    @Column(name = "classification_manual", nullable = false)
    private boolean classificationManual = false;

    /**
     * F1-a 고정DC 수동 override 플래그.
     *
     * <p>{@code true} 이면 시트 sync 가 고정DC 셀 기본값으로 {@code fixedDiscountRate} 를 덮어쓰지 않는다.
     */
    @Column(name = "fixed_discount_manual", nullable = false)
    private boolean fixedDiscountManual = false;

    /** F1.5 — GAS 판넬 품명 정규식으로 1회 분류한 판넬 attribute. */
    @Column(name = "panel_type", length = 32)
    private String panelType;

    /** F1.5 — BundleExpander 리모컨 옵션 정규식으로 1회 분류한 리모컨 attribute. */
    @Column(name = "remote_type", length = 32)
    private String remoteType;

    /** 시트 D/E 출고가 (베이스 — 정적가). 시점별 가격은 PriceHistory 참조. */
    @Column(name = "release_price", nullable = false, precision = 12, scale = 2)
    private BigDecimal releasePrice = BigDecimal.ZERO;

    /** 시트 F/G/H 납품가 (베이스 — 정적가). */
    @Column(name = "delivery_price", nullable = false, precision = 12, scale = 2)
    private BigDecimal deliveryPrice = BigDecimal.ZERO;

    /** 싱글 세트 B열 평형. */
    @Column(name = "pyong_size", precision = 5, scale = 2)
    private BigDecimal pyongSize;

    /** 시트 출처별 내부 카테고리 (ProductSpec/시드 변환용). */
    @Enumerated(EnumType.STRING)
    @Column(name = "product_category", length = 20)
    private ProductCategory productCategory;

    /** 재고 생성 대상 여부 — 비상품은 견적/전표에는 쓰되 inventory-service 에서 재고를 만들지 않는다. */
    @Enumerated(EnumType.STRING)
    @Column(name = "goods_type", nullable = false, length = 16)
    private ProductGoodsType goodsType = ProductGoodsType.GOODS;

    /** DOMAIN-EXTENSIONS §3 — default NONE (분류되지 않은 품목 미노출). */
    @Enumerated(EnumType.STRING)
    @Column(name = "usage_scope", nullable = false, length = 16)
    private UsageScope usageScope = UsageScope.NONE;

    /**
     * @deprecated V18 이후 견적 노출 단일 원천은 {@code product_estimate_exposure}.
     * 롤백 안전을 위해 컬럼 매핑만 보존하며 신규 코드는 읽거나 쓰지 않는다.
     */
    @Deprecated
    @Enumerated(EnumType.STRING)
    @Column(name = "estimate_category", length = 20)
    private EstimateCategory estimateCategory;

    /**
     * @deprecated V18 이후 카테고리별 표시 순서는 {@code product_estimate_exposure.display_order}.
     * 롤백 안전을 위해 컬럼 매핑만 보존하며 신규 코드는 읽거나 쓰지 않는다.
     */
    @Deprecated
    @Column(name = "display_order")
    private Integer displayOrder;

    /**
     * 수동 노출 override 플래그(V14, 2026-06-11).
     *
     * <p>{@code true} 이면 {@link com.samhanair.logis.product.service.ProductSheetSyncService}
     * upsert 경로에서 {@code usageScope} 및 M:N 견적 노출을 시트 기준으로 덮어쓰지 않는다.
     *
     * <p>초기값 {@code false} — 기존 row 는 전부 시트 자동 분류 상태.
     * {@link #markUsageManual(UsageScope)} 로 {@code true} 전환,
     * {@link #clearUsageManual()} 로 {@code false} 복귀 (다음 sync 에서 시트 기준 재분류).
     */
    @Column(name = "usage_scope_manual", nullable = false)
    private boolean usageScopeManual = false;

    /** 구성품 수기 편집 여부. true 이면 시트 구성품 sync 가 해당 세트를 덮어쓰지 않는다. */
    @Column(name = "bundle_components_manual", nullable = false)
    private boolean bundleComponentsManual = false;

    /** (legacy) 시트 규격 컬럼 — ProductSpec 1:N 으로 대체. read-only fallback. */
    @Column(name = "spec_text", length = 255)
    private String specText;

    /** 시트 비고 컬럼. */
    @Column(name = "remark", columnDefinition = "TEXT")
    private String remark;

    /** BundleComponent FK (싱글 구성품 M열 / 상업멀티 구성 I열). sub-product 만 NOT NULL. */
    @Column(name = "parent_bundle_set_model", length = 64)
    private String parentBundleSetModel;

    // ============================================================
    // Stage 1 local-test seed — 이카운트 품목 + HVAC 특화 단가 6종 (V5 migration)
    // 출처: docs/migration/ecount-reference/091955~092016
    // ============================================================

    /** 이카운트 품목코드 (5자리, 01XXXX). 사용자 노출 식별자 (modelCode 와 별도 — 시트 vs 이카운트). */
    @Column(name = "product_code", length = 100)
    private String productCode;

    /** 규격 (예: "13평형 / R32 / 인버터"). */
    @Column(name = "specification", length = 255)
    private String specification;

    /** 단위 (EA/SET/M/BOX/KG). default EA. */
    @Column(name = "unit", length = 20, nullable = false)
    private String unit = "EA";

    /** 품목구분 (상품/제품/원재료). 도매상은 모두 "상품". */
    @Column(name = "product_business_type", length = 20, nullable = false)
    private String productBusinessType = "상품";

    /** 수량관리 여부. */
    @Column(name = "inventory_qty_mgmt", nullable = false)
    private Boolean inventoryQtyMgmt = Boolean.TRUE;

    /** 바코드 (한국 EAN-13 13자리 — 880 prefix). */
    @Column(name = "barcode", length = 20)
    private String barcode;

    /** 매출 부가세율 (10% = 0.10). */
    @Column(name = "vat_rate_on_sales", precision = 5, scale = 4, nullable = false)
    private BigDecimal vatRateOnSales = new BigDecimal("0.10");

    /** 매입 부가세율 (10% = 0.10). */
    @Column(name = "vat_rate_on_purchase", precision = 5, scale = 4, nullable = false)
    private BigDecimal vatRateOnPurchase = new BigDecimal("0.10");

    /** VAT 포함 여부 (이카운트 default true). */
    @Column(name = "price_includes_vat", nullable = false)
    private Boolean priceIncludesVat = Boolean.TRUE;

    /** 안전재고. */
    @Column(name = "safety_stock_qty", nullable = false)
    private Integer safetyStockQty = 0;

    /** 조달기간 (일). default 7. */
    @Column(name = "lead_time_days", nullable = false)
    private Integer leadTimeDays = 7;

    /** 최소주문수량. default 1. */
    @Column(name = "min_order_unit", nullable = false)
    private Integer minOrderUnit = 1;

    /** 구매처 (예: "삼성전자(주)"). */
    @Column(name = "purchase_source", length = 100)
    private String purchaseSource;

    /** 분류1 (Samsung 에어컨 / Samsung 부속). */
    @Column(name = "product_group1", length = 50)
    private String productGroup1;

    /** 분류2 (벽걸이/스탠드/시스템/천장형/공기청정기/부속). */
    @Column(name = "product_group2", length = 50)
    private String productGroup2;

    /** MIG-2 품목계층그룹 raw 명칭 ([CAC] 싱글 등). */
    @Column(name = "category_group", length = 100)
    private String categoryGroup;

    /** MIG-2/SAS VAT 계산 정책. 이카운트 품목은 기본 과세. */
    @Enumerated(EnumType.STRING)
    @Column(name = "tax_type", nullable = false, length = 20)
    private ProductTaxType taxType = ProductTaxType.TAXABLE;

    /** VAT-inclusive 기준 단가. slip-service / SAS 라인 금액 분리 기준과 일관. */
    @Column(name = "unit_price_with_vat", nullable = false, precision = 15, scale = 2)
    private BigDecimal unitPriceWithVat = BigDecimal.ZERO;

    // === HVAC 특화 단가 6종 (이카운트 발견 — Stage 1 핵심 보강) ===

    /** 입고단가 — 매입 기준가. */
    @Column(name = "inbound_price", precision = 15, scale = 2, nullable = false)
    private BigDecimal inboundPrice = BigDecimal.ZERO;

    /** 출고단가 — 일반 출하 기준가. inbound * 1.20. */
    @Column(name = "outbound_price", precision = 15, scale = 2, nullable = false)
    private BigDecimal outboundPrice = BigDecimal.ZERO;

    /** ⭐ 싱글 단가 — 벽걸이 단일 거래. inbound * 1.50. */
    @Column(name = "single_price", precision = 15, scale = 2, nullable = false)
    private BigDecimal singlePrice = BigDecimal.ZERO;

    /** ⭐ 실외기 단가 — 원형/스탠드 실외기 교체. inbound * 1.40. */
    @Column(name = "outdoor_price", precision = 15, scale = 2, nullable = false)
    private BigDecimal outdoorPrice = BigDecimal.ZERO;

    /** ⭐ 멀티 50% 할인가. inbound * 1.10. */
    @Column(name = "multi_50_price", precision = 15, scale = 2, nullable = false)
    private BigDecimal multi50Price = BigDecimal.ZERO;

    /** ⭐ 멀티 48% 할인가. inbound * 1.12. */
    @Column(name = "multi_48_price", precision = 15, scale = 2, nullable = false)
    private BigDecimal multi48Price = BigDecimal.ZERO;

    /** ⭐ 멀티 45% 할인가. inbound * 1.15. */
    @Column(name = "multi_45_price", precision = 15, scale = 2, nullable = false)
    private BigDecimal multi45Price = BigDecimal.ZERO;

    /** ⭐ 단품 35% 할인가. inbound * 1.30. */
    @Column(name = "item_35_price", precision = 15, scale = 2, nullable = false)
    private BigDecimal item35Price = BigDecimal.ZERO;

    /**
     * PR-H4b 누적 수정 횟수 — product_audit_logs 의 다음 revision_no 채번 보조 + FE timeline UI 표시.
     * V6 마이그에서 신규. 기존 row 는 0 으로 backfill.
     */
    @Column(name = "revision_count", nullable = false)
    private int revisionCount = 0;

    private Product(String name, String modelName, Category category,
                    BigDecimal sellingPrice, BigDecimal purchasePrice, String currency,
                    Map<String, String> tags, String description) {
        this.name = name;
        this.modelName = modelName;
        this.category = category;
        this.sellingPrice = sellingPrice;
        this.purchasePrice = purchasePrice;
        this.currency = currency;
        this.status = ProductStatus.ACTIVE;
        this.tags = tags;
        this.description = description;
    }

    public static Product create(String name, String modelName, Category category,
                                 BigDecimal sellingPrice, BigDecimal purchasePrice, String currency,
                                 Map<String, String> tags, String description) {
        validateNonNegative(sellingPrice, "출고가");
        validateNonNegative(purchasePrice, "납품가");
        return new Product(name, modelName, category, sellingPrice, purchasePrice,
                normaliseCurrency(currency), tags, description);
    }

    /**
     * Phase 6 M1a 마이그 시드 전용 factory — 시트 row 한 줄 → ProductMaster 한 entity.
     * 출처: M1a 시드 스크립트 ProductSeedRunner.
     */
    public static Product seedFromSheet(String name, String modelCode, Category category,
                                        BigDecimal releasePrice, BigDecimal deliveryPrice,
                                        ProductType productType, ProductCategory productCategory,
                                        UsageScope usageScope, EstimateCategory estimateCategory) {
        validateNonNegative(releasePrice, "출고가");
        validateNonNegative(deliveryPrice, "납품가");
        Product p = new Product(name, modelCode, category,
                releasePrice, deliveryPrice, "KRW", null, null);
        p.lineage = ProductLineage.SHEET;
        p.modelCode = modelCode;
        p.productType = productType == null ? ProductType.SINGLE : productType;
        p.productCategory = productCategory;
        p.usageScope = usageScope == null ? UsageScope.NONE : usageScope;
        p.releasePrice = releasePrice;
        p.deliveryPrice = deliveryPrice;
        return p;
    }

    /**
     * ECOUNT-first 품목이 시트에 등장하면 시트 정본 계보로 승격한다.
     *
     * <p>승격 자체만 담당하고 이름·노출 구분·품목 분류는 시트 sync가 같은 행의 정본값으로
     * 별도 갱신한다. 이미 SHEET 또는 MANUAL 계보인 품목은 변경하지 않는다.
     *
     * @return ECOUNT 계보에서 SHEET 계보로 실제 승격했으면 {@code true}
     */
    public boolean promoteEcountToSheet() {
        if (lineage != ProductLineage.ECOUNT) {
            return false;
        }
        lineage = ProductLineage.SHEET;
        return true;
    }

    public void rename(String name) {
        this.name = name;
    }

    public void changeModelName(String modelName) {
        this.modelName = modelName;
    }

    public void changeModelCode(String modelCode) {
        this.modelCode = modelCode;
    }

    public void changeCategory(Category category) {
        this.category = category;
    }

    public void repriceSelling(BigDecimal sellingPrice) {
        validateNonNegative(sellingPrice, "출고가");
        this.sellingPrice = sellingPrice;
    }

    public void repricePurchase(BigDecimal purchasePrice) {
        validateNonNegative(purchasePrice, "납품가");
        this.purchasePrice = purchasePrice;
    }

    public void changeCurrency(String currency) {
        this.currency = normaliseCurrency(currency);
    }

    public void replaceTags(Map<String, String> tags) {
        this.tags = tags == null ? null : new HashMap<>(tags);
    }

    public void putTag(String key, String value) {
        if (this.tags == null) {
            this.tags = new HashMap<>();
        }
        this.tags.put(key, value);
    }

    public void removeTag(String key) {
        if (this.tags != null) {
            this.tags.remove(key);
        }
    }

    public void discontinue() {
        this.status = ProductStatus.DISCONTINUED;
    }

    public void reactivate() {
        this.status = ProductStatus.ACTIVE;
    }

    /** 시트 정본의 판매 상태를 반영한다. null은 호출자가 보존 정책을 적용하도록 허용하지 않는다. */
    public void changeStatus(ProductStatus status) {
        if (status == null) {
            throw new IllegalArgumentException("제품 상태는 필수입니다");
        }
        this.status = status;
    }

    public void editDescription(String description) {
        this.description = description;
    }

    // ============================================================
    // V3 신규 setter (마이그 + admin 운영 변경)
    // ============================================================

    /**
     * Admin 운영 — usageScope 변경. 견적 카테고리 노출은 V18 M:N 테이블에서 별도 관리한다.
     */
    public void changeUsage(UsageScope usageScope) {
        this.usageScope = usageScope == null ? UsageScope.NONE : usageScope;
    }

    /**
     * @deprecated V18 이후 estimateCategory 는 Product 에 저장하지 않는다.
     * 기존 호출자 호환만 위해 남기며 {@link #changeUsage(UsageScope)} 로 위임한다.
     */
    @Deprecated
    public void changeUsage(UsageScope usageScope, EstimateCategory estimateCategory) {
        changeUsage(usageScope);
    }

    /**
     * 수동 노출 override 설정 — usageScope 를 지정값으로 변경하고
     * {@code usageScopeManual=true} 를 마킹한다.
     *
     * <p>이후 {@link com.samhanair.logis.product.service.ProductSheetSyncService} upsert 에서
     * 시트 기준 자동 재분류가 차단된다. {@link #clearUsageManual()} 로 해제하면 다음 sync 에서
     * 시트 기준으로 재분류된다.
     *
     * @param scope 새 노출 범위 (null 이면 {@link UsageScope#NONE} 처리)
     */
    public void markUsageManual(UsageScope scope) {
        this.usageScope = scope == null ? UsageScope.NONE : scope;
        this.usageScopeManual = true;
    }

    /**
     * 수동 노출 override 해제 — {@code usageScopeManual=false} 로 복귀.
     *
     * <p>usageScope 및 M:N 노출 값 자체는 변경하지 않는다. 다음
     * {@link com.samhanair.logis.product.service.ProductSheetSyncService} sync 가
     * 시트 기준으로 재분류한다.
     */
    public void clearUsageManual() {
        this.usageScopeManual = false;
    }

    /** 구성품 replace-all 성공 후 세트 단위 수기 편집 보호를 켠다. */
    public void markBundleComponentsManual() {
        this.bundleComponentsManual = true;
    }

    /** 구성품 수기 편집 보호를 해제한다. 다음 시트 sync 부터 시트 정본을 적용한다. */
    public void clearBundleComponentsManual() {
        this.bundleComponentsManual = false;
    }

    /**
     * 변동DC 수동 override 설정 — hasVariableDiscount 를 지정값으로 변경하고
     * {@code variableDiscountManual=true} 를 마킹한다.
     *
     * <p>이후 {@link com.samhanair.logis.product.service.ProductSheetSyncService} upsert 에서
     * 시트 기준 변동DC 자동 적재가 차단된다. {@link #clearVariableDiscountManual()} 로 해제하면
     * 다음 sync 에서 시트 기준으로 재적재된다.
     *
     * @param hasVariableDiscount 수동 지정할 변동DC 적용 여부
     */
    public void markVariableDiscountManual(boolean hasVariableDiscount) {
        this.hasVariableDiscount = hasVariableDiscount;
        this.variableDiscountManual = true;
    }

    /**
     * 변동DC 수동 override 해제 — {@code variableDiscountManual=false} 로 복귀.
     *
     * <p>hasVariableDiscount 값 자체는 변경하지 않는다. 다음
     * {@link com.samhanair.logis.product.service.ProductSheetSyncService} sync 가
     * 시트 기준으로 재적재한다.
     */
    public void clearVariableDiscountManual() {
        this.variableDiscountManual = false;
    }

    /** 변동DC 룰 적용 — VariableDiscountDetector 호출 결과 set. */
    public void applyDiscountRules(boolean hasVariableDiscount,
                                   MaterialKey setMaterialKey,
                                   boolean legacyDiscountFlag,
                                   BigDecimal fixedDiscountRate) {
        this.hasVariableDiscount = hasVariableDiscount;
        this.setMaterialKey = setMaterialKey;
        this.legacyDiscountFlag = legacyDiscountFlag;
        this.fixedDiscountRate = fixedDiscountRate;
    }

    /**
     * 견적 품목 L/M/S 분류를 갱신한다.
     *
     * <p>계층 정합은 {@code ClassificationService/ProductSheetSyncService} 에서 검증한 뒤 전달한다.
     * null 은 해당 단계 미분류를 뜻한다.
     */
    public void changeClassifications(Classification catL, Classification catM, Classification catS) {
        this.catL = catL;
        this.catM = catM;
        this.catS = catS;
    }

    /** 분류 수동 override 를 저장한다. null 은 해당 단계 미분류를 의미하며 이후 sync 에서 보존된다. */
    public void markClassificationManual(Classification catL, Classification catM, Classification catS) {
        changeClassifications(catL, catM, catS);
        this.classificationManual = true;
    }

    /** 품목별 고정DC율을 변경한다. null 은 고정DC 미지정으로 저장한다. */
    public void changeFixedDiscountRate(BigDecimal fixedDiscountRate) {
        this.fixedDiscountRate = fixedDiscountRate;
    }

    /** 고정DC 수동 override 를 저장한다. null 은 고정DC 미지정을 의미하며 이후 sync 에서 보존된다. */
    public void markFixedDiscountManual(BigDecimal fixedDiscountRate) {
        changeFixedDiscountRate(fixedDiscountRate);
        this.fixedDiscountManual = true;
    }

    /** F1.5 품목 attribute 갱신. blank 는 null 로 정규화한다. */
    public void changeAttributes(String panelType, String remoteType) {
        this.panelType = normalizeAttribute(panelType);
        this.remoteType = normalizeAttribute(remoteType);
    }

    /** Bundle 모드 set (마이그 + 운영). */
    public void changeBundle(ProductType productType, BundleMode bundleMode) {
        this.productType = productType == null ? ProductType.SINGLE : productType;
        this.bundleMode = (this.productType == ProductType.BUNDLE) ? bundleMode : null;
    }

    /** 수기 품목 등록/수정에서 내부 카테고리를 지정한다. */
    public void changeProductCategory(ProductCategory productCategory) {
        this.productCategory = productCategory;
    }

    /** 상품/비상품 구분 변경. null 은 기존 호환을 위해 상품으로 정규화한다. */
    public void changeGoodsType(ProductGoodsType goodsType) {
        this.goodsType = goodsType == null ? ProductGoodsType.GOODS : goodsType;
    }

    /** 비상품 전환 시 수량관리도 함께 끈다. */
    public void changeInventoryQtyMgmt(boolean enabled) {
        this.inventoryQtyMgmt = enabled;
    }

    /** 단위 변경. null/blank 는 기존 값을 보존한다. */
    public void changeUnit(String unit) {
        if (unit != null && !unit.isBlank()) {
            this.unit = unit;
        }
    }

    /** discountFlags bitset 갱신 (modelCode prefix 7-룰 매칭). */
    public void changeDiscountFlags(String flagsBits) {
        this.discountFlags = (flagsBits == null || flagsBits.length() != 6) ? "000000" : flagsBits;
    }

    public void changeRemark(String remark) {
        this.remark = remark;
    }

    /**
     * @deprecated V18 이후 표시 순서는 {@code product_estimate_exposure} 에 저장한다.
     * 기존 호출자 호환만 위해 남긴 no-op 이다.
     */
    @Deprecated
    public void changeDisplayOrder(Integer displayOrder) {
        // no-op: deprecated products.display_order 쓰기 금지.
    }

    public void changeSpecText(String specText) {
        this.specText = specText;
    }

    public void changePyongSize(BigDecimal pyongSize) {
        this.pyongSize = pyongSize;
    }

    public void changeParentBundleSetModel(String parentBundleSetModel) {
        this.parentBundleSetModel = parentBundleSetModel;
    }

    public void changePrices(BigDecimal releasePrice, BigDecimal deliveryPrice) {
        if (releasePrice != null) {
            validateNonNegative(releasePrice, "출고가");
            this.releasePrice = releasePrice;
        }
        if (deliveryPrice != null) {
            validateNonNegative(deliveryPrice, "납품가");
            this.deliveryPrice = deliveryPrice;
        }
    }

    // ============================================================
    // Stage 1 — 이카운트 + HVAC 특화 단가 보강 setter
    // (seed + admin 운영 변경. reflection 직접 접근 금지 가드)
    // ============================================================

    /** 이카운트 품목 메타 갱신 (productCode/specification/unit/business type/inventoryQty). */
    public void updateEcountMeta(String productCode, String specification, String unit,
                                 String productBusinessType, boolean inventoryQtyMgmt,
                                 String barcode) {
        this.productCode = productCode;
        this.specification = specification;
        if (unit != null && !unit.isBlank()) this.unit = unit;
        if (productBusinessType != null && !productBusinessType.isBlank()) {
            this.productBusinessType = productBusinessType;
        }
        this.inventoryQtyMgmt = inventoryQtyMgmt;
        this.barcode = barcode;
    }

    /** 부가세율 / VAT 포함 여부 갱신. */
    public void updateVatPolicy(BigDecimal vatRateOnSales, BigDecimal vatRateOnPurchase,
                                boolean priceIncludesVat) {
        if (vatRateOnSales != null) {
            validateNonNegative(vatRateOnSales, "매출 부가세율");
            this.vatRateOnSales = vatRateOnSales;
        }
        if (vatRateOnPurchase != null) {
            validateNonNegative(vatRateOnPurchase, "매입 부가세율");
            this.vatRateOnPurchase = vatRateOnPurchase;
        }
        this.priceIncludesVat = priceIncludesVat;
    }

    /** 재고 정책 갱신 (안전재고/조달기간/최소주문/구매처). */
    public void updateInventoryPolicy(int safetyStockQty, int leadTimeDays,
                                      int minOrderUnit, String purchaseSource) {
        if (safetyStockQty < 0) {
            throw new IllegalArgumentException("safetyStockQty 는 0 이상 필수");
        }
        if (leadTimeDays < 0) {
            throw new IllegalArgumentException("leadTimeDays 는 0 이상 필수");
        }
        if (minOrderUnit <= 0) {
            throw new IllegalArgumentException("minOrderUnit 은 1 이상 필수");
        }
        this.safetyStockQty = safetyStockQty;
        this.leadTimeDays = leadTimeDays;
        this.minOrderUnit = minOrderUnit;
        this.purchaseSource = purchaseSource;
    }

    /** 분류 갱신 (group1 / group2). */
    public void updateGroups(String productGroup1, String productGroup2) {
        this.productGroup1 = productGroup1;
        this.productGroup2 = productGroup2;
    }

    /** MIG-2 이카운트 품목 import 메타 갱신. */
    public void updateMig2EcountFields(String categoryGroup, ProductTaxType taxType,
                                       BigDecimal unitPriceWithVat) {
        this.categoryGroup = categoryGroup;
        this.taxType = taxType == null ? ProductTaxType.TAXABLE : taxType;
        if (unitPriceWithVat != null) {
            validateNonNegative(unitPriceWithVat, "VAT 포함 단가");
            this.unitPriceWithVat = unitPriceWithVat;
        }
    }

    /**
     * HVAC 특화 단가 6종 일괄 갱신 (이카운트 매트릭스 룰 적용).
     *
     * <p>비즈니스 룰 (Stage 1 dev-report §HVAC 단가 6종 적용 비즈니스 룰):
     * <ul>
     *     <li>{@code outbound = inbound * 1.20} (일반 출하)</li>
     *     <li>{@code single  = inbound * 1.50} (벽걸이 단일 거래)</li>
     *     <li>{@code outdoor = inbound * 1.40} (실외기 교체)</li>
     *     <li>{@code multi50 = inbound * 1.10} (멀티 50% 할인)</li>
     *     <li>{@code multi48 = inbound * 1.12} (멀티 48% 할인)</li>
     *     <li>{@code multi45 = inbound * 1.15} (멀티 45% 할인)</li>
     *     <li>{@code item35  = inbound * 1.30} (단품 35% 할인)</li>
     * </ul>
     */
    public void updateHvacPriceMatrix(BigDecimal inboundPrice, BigDecimal outboundPrice,
                                      BigDecimal singlePrice, BigDecimal outdoorPrice,
                                      BigDecimal multi50Price, BigDecimal multi48Price,
                                      BigDecimal multi45Price, BigDecimal item35Price) {
        validateNonNegative(inboundPrice, "입고단가");
        validateNonNegative(outboundPrice, "출고단가");
        validateNonNegative(singlePrice, "싱글단가");
        validateNonNegative(outdoorPrice, "실외기단가");
        validateNonNegative(multi50Price, "멀티50단가");
        validateNonNegative(multi48Price, "멀티48단가");
        validateNonNegative(multi45Price, "멀티45단가");
        validateNonNegative(item35Price, "단품35단가");
        this.inboundPrice = inboundPrice;
        this.outboundPrice = outboundPrice;
        this.singlePrice = singlePrice;
        this.outdoorPrice = outdoorPrice;
        this.multi50Price = multi50Price;
        this.multi48Price = multi48Price;
        this.multi45Price = multi45Price;
        this.item35Price = item35Price;
    }

    /** seed/단종 처리 — status 직접 변경 (DISCONTINUED). */
    public void markDiscontinued() {
        this.status = ProductStatus.DISCONTINUED;
    }

    /**
     * PR-H4b 단조 증가 revision 채번 — audit overlay 1행 INSERT 직전 호출.
     * 같은 mutation 의 다중 필드 변경은 service 레이어가 1회만 호출하여 같은 revisionNo 공유.
     *
     * @return 새 revisionNo (1, 2, 3, ...)
     */
    public int incrementRevision() {
        this.revisionCount += 1;
        return this.revisionCount;
    }

    private static void validateNonNegative(BigDecimal value, String fieldLabel) {
        if (value == null || value.signum() < 0) {
            throw new IllegalArgumentException(fieldLabel + "는 0 이상이어야 합니다");
        }
    }

    private static String normaliseCurrency(String currency) {
        if (currency == null || currency.isBlank()) {
            return "KRW";
        }
        if (currency.length() != 3) {
            throw new IllegalArgumentException("통화 코드는 ISO 4217 3자리여야 합니다: " + currency);
        }
        return currency.toUpperCase();
    }

    private static String normalizeAttribute(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
