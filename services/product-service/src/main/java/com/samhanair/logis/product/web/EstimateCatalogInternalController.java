package com.samhanair.logis.product.web;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.product.domain.BranchPipeLookup;
import com.samhanair.logis.product.domain.BundleComponent;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.MaterialPrice;
import com.samhanair.logis.product.domain.OduRecommendationLookup;
import com.samhanair.logis.product.domain.PriceHistory;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductEstimateExposure;
import com.samhanair.logis.product.domain.ProductSpec;
import com.samhanair.logis.product.domain.ProductStatus;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.repository.BranchPipeLookupRepository;
import com.samhanair.logis.product.repository.BundleComponentRepository;
import com.samhanair.logis.product.repository.MaterialPriceRepository;
import com.samhanair.logis.product.repository.OduRecommendationLookupRepository;
import com.samhanair.logis.product.repository.PriceHistoryRepository;
import com.samhanair.logis.product.repository.ProductEstimateExposureRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.repository.ProductSpecRepository;
import com.samhanair.logis.product.service.QuantitySyncRuleService;
import com.samhanair.logis.product.domain.QuantitySyncEstimateCategory;
import com.samhanair.logis.product.web.dto.QuantitySyncRuleResponse;
import com.samhanair.logis.product.web.dto.ProductSpecResponse;
import io.swagger.v3.oas.annotations.Operation;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * #30 — estimate-app(종합견적서 웹) 카탈로그 벌크 internal endpoint.
 *
 * <p>개발책임자 결정(2026-06-09, 옵션C 폐기): estimate-app 의 Google Sheets 직접 read 를
 * 전면 우리 DB 로 치환. 본 컨트롤러가 legacy 시트 getter(getHomeMulti/getSingleSets/
 * getSingleParts/getCommercialMulti/getCommercialParts/getOldProducts_/getSingleMatPrices/
 * getRecommendOduData/getPriceIncData_) 의 데이터 소스를 1:1 대체한다 — sheet→DB 적재는
 * 기존 {@code ProductSheetSyncService}/{@code ProductLookupSheetSyncService} 가 담당하고,
 * estimate-app 은 시트가 아닌 본 endpoint 만 read.
 *
 * <p>인증: {@code /products/internal/} prefix → InternalTokenFilter(X-Internal-Token,
 * missing 즉시 401 — product-service 표준).
 *
 * <p>응답 필드는 legacy getter 출력과의 매핑을 위해 변동DC 분기(useK2=hasVariableDiscount,
 * matKey=setMaterialKey, isDisc=legacyDiscountFlag, 고정DC=fixedDiscountRate)와
 * 사양 파생(capacity=spec '용량', maxIndoor=spec '최대연결실내기대수')을 동반한다.
 */
@RestController
@RequestMapping("/products/internal/estimate-catalog")
@RequiredArgsConstructor
public class EstimateCatalogInternalController {

    private static final LocalDate BASELINE_DATE = LocalDate.of(2000, 1, 1);
    private static final String SPEC_CAPACITY = "용량";
    private static final String SPEC_MAX_INDOOR = "최대연결실내기대수";

    private final QuantitySyncRuleService quantitySyncRuleService;

    /*
     * legacy clients/web/estimate-app/lib/code.js getSpecDetailMap_()
     * scanHome/scanSingle/scanComm 출력 필드명의 거울이다. 필드명 변경 시 본 목록과
     * clients/web/estimate-app/test/calc-fidelity.test.js 의 field-set canary 를 함께 갱신한다.
     */
    private static final List<String> HOME_SPEC_FIELDS = List.of(
            "pipeDia", "gas", "breaker", "powerLine", "size", "weight", "packSize", "packWeight",
            "maxPipe", "maxDrop", "cool_kcal", "cool_kw", "cool_power", "effGrade",
            "cool_cap_kcal", "cool_cap_kw", "cool_pow_kw", "grade");
    private static final List<String> SINGLE_SPEC_FIELDS = List.of(
            "grade", "pipeDia", "cool_pow_kw", "heat_pow_kw", "cool_cap_kw", "heat_cap_kw",
            "cool_cap_kcal", "heat_cap_kcal", "powerLine", "breaker", "inSize", "outSize",
            "inWeight", "outWeight", "inPackSize", "outPackSize", "inPackWeight", "outPackWeight",
            "pipeLen", "drop", "gas");
    private static final List<String> COMM_SPEC_FIELDS = List.of(
            "pipeDia", "gas", "cool_cap_kcal", "cool_cap_kw", "heat_cap_kcal", "heat_cap_kw",
            "cool_pow_kw", "heat_pow_kw", "breaker", "powerLine", "size", "weight",
            "packSize", "packWeight", "grade", "maxPipe", "maxDrop");
    private static final List<String> COMM_ERV_SPEC_FIELDS = List.of(
            "gas", "cool_kcal", "cool_power", "heat_kcal", "heat_power", "pipeDia",
            "cool_kw", "heat_kw", "cool_cap_kcal", "cool_cap_kw", "heat_cap_kcal",
            "heat_cap_kw", "cool_pow_kw", "heat_pow_kw", "breaker", "powerLine",
            "size", "weight", "packSize", "packWeight", "grade", "maxPipe", "maxDrop");

    private static final Map<String, List<String>> HOME_SPEC_KEY_TO_FIELDS = Map.ofEntries(
            Map.entry("배관경", List.of("pipeDia")),
            Map.entry("냉매가스", List.of("gas")),
            Map.entry("차단기, A", List.of("breaker")),
            Map.entry("전원선, mm²", List.of("powerLine")),
            Map.entry("제품크기, mm", List.of("size")),
            Map.entry("제품중량, kg", List.of("weight")),
            Map.entry("포장치수, mm", List.of("packSize")),
            Map.entry("포장중량, kg", List.of("packWeight")),
            Map.entry("배관길이, m", List.of("maxPipe")),
            Map.entry("고낙차, m", List.of("maxDrop")),
            Map.entry("냉방능력, kcal/h", List.of("cool_kcal", "cool_cap_kcal")),
            Map.entry("냉방능력, kW", List.of("cool_kw", "cool_cap_kw")),
            Map.entry("냉방소비전력, kW", List.of("cool_power", "cool_pow_kw")),
            Map.entry("에너지소비효율등급", List.of("effGrade", "grade")));

    private static final Map<String, List<String>> SINGLE_SPEC_KEY_TO_FIELDS = Map.ofEntries(
            Map.entry("에너지소비효율등급", List.of("grade")),
            Map.entry("배관경", List.of("pipeDia")),
            Map.entry("냉방소비전력, kW", List.of("cool_pow_kw")),
            Map.entry("난방소비전력, kW", List.of("heat_pow_kw")),
            Map.entry("냉방능력, kW", List.of("cool_cap_kw")),
            Map.entry("난방능력, kW", List.of("heat_cap_kw")),
            Map.entry("냉방능력, kcal/h", List.of("cool_cap_kcal")),
            Map.entry("난방능력, kcal/h", List.of("heat_cap_kcal")),
            Map.entry("전원선, mm²", List.of("powerLine")),
            Map.entry("차단기, A", List.of("breaker")),
            Map.entry("실내기크기, mm", List.of("inSize")),
            Map.entry("실외기크기, mm", List.of("outSize")),
            Map.entry("실내기중량, kg", List.of("inWeight")),
            Map.entry("실외기중량, kg", List.of("outWeight")),
            Map.entry("실내기포장, mm", List.of("inPackSize")),
            Map.entry("실외기포장, mm", List.of("outPackSize")),
            Map.entry("실내기포장중량, kg", List.of("inPackWeight")),
            Map.entry("실외기포장중량, kg", List.of("outPackWeight")),
            Map.entry("배관길이, m", List.of("pipeLen")),
            Map.entry("고낙차, m", List.of("drop")),
            Map.entry("냉매가스", List.of("gas")));

    private static final Map<String, List<String>> COMM_SPEC_KEY_TO_FIELDS = Map.ofEntries(
            Map.entry("배관경", List.of("pipeDia")),
            Map.entry("냉매가스", List.of("gas")),
            Map.entry("냉방능력, kcal/h", List.of("cool_cap_kcal")),
            Map.entry("냉방능력, kW", List.of("cool_cap_kw")),
            Map.entry("난방능력, kcal/h", List.of("heat_cap_kcal")),
            Map.entry("난방능력, kW", List.of("heat_cap_kw")),
            Map.entry("냉방소비전력, kW", List.of("cool_pow_kw")),
            Map.entry("난방소비전력, kW", List.of("heat_pow_kw")),
            Map.entry("차단기, A", List.of("breaker")),
            Map.entry("전원선, mm²", List.of("powerLine")),
            Map.entry("제품크기, mm", List.of("size")),
            Map.entry("제품중량, kg", List.of("weight")),
            Map.entry("포장치수, mm", List.of("packSize")),
            Map.entry("포장중량, kg", List.of("packWeight")),
            Map.entry("소비효율등급", List.of("grade")),
            Map.entry("에너지소비효율등급", List.of("grade")),
            Map.entry("배관길이, m", List.of("maxPipe")),
            Map.entry("고낙차, m", List.of("maxDrop")));

    private static final Map<String, List<String>> COMM_ERV_SPEC_KEY_TO_FIELDS = Map.ofEntries(
            Map.entry("냉매가스", List.of("gas")),
            Map.entry("냉방능력, kcal/h", List.of("cool_kcal")),
            Map.entry("냉방소비전력, kW", List.of("cool_power")),
            Map.entry("난방능력, kcal/h", List.of("heat_kcal")),
            Map.entry("난방소비전력, kW", List.of("heat_power")),
            Map.entry("차단기, A", List.of("breaker")),
            Map.entry("전원선, mm²", List.of("powerLine")),
            Map.entry("제품크기, mm", List.of("size")),
            Map.entry("제품중량, kg", List.of("weight")),
            Map.entry("포장치수, mm", List.of("packSize")),
            Map.entry("포장중량, kg", List.of("packWeight")),
            Map.entry("소비효율등급", List.of("grade")),
            Map.entry("에너지소비효율등급", List.of("grade")),
            Map.entry("배관길이, m", List.of("maxPipe")),
            Map.entry("고낙차, m", List.of("maxDrop")));
    private static final Map<String, List<String>> HOME_PANEL_SPEC_KEY_TO_FIELDS = Map.of(
            "타공사이즈, mm", List.of("cool_kw", "cool_cap_kw"),
            "전산볼트간격, mm", List.of("cool_power", "cool_pow_kw"));
    private static final Map<String, List<String>> SINGLE_COMM_PANEL_SPEC_KEY_TO_FIELDS = Map.of(
            "타공사이즈, mm", List.of("cool_cap_kcal"),
            "전산볼트간격, mm", List.of("cool_pow_kw"));

    private final ProductRepository productRepository;
    private final ProductSpecRepository productSpecRepository;
    private final BundleComponentRepository bundleComponentRepository;
    private final PriceHistoryRepository priceHistoryRepository;
    private final MaterialPriceRepository materialPriceRepository;
    private final OduRecommendationLookupRepository oduRecommendationLookupRepository;
    private final BranchPipeLookupRepository branchPipeLookupRepository;
    private final ProductEstimateExposureRepository exposureRepository;

    /** 카탈로그 행 — legacy 시트 row 동등 + F1-a DB 분류(catL/M/S) 보강. */
    public record CatalogRow(
            String name,
            String modelCode,
            String unit,
            BigDecimal deliveryPrice,
            BigDecimal releasePrice,
            String catL,
            String catM,
            String catS,
            Boolean hasVariableDiscount,
            String materialKey,
            BigDecimal fixedDiscountRate,
            Boolean legacyDiscountFlag,
            String remark,
            String specText,
            BigDecimal pyongSize,
            String capacity,
            String maxIndoor,
            String productType,
            ProductStatus status) {
    }

    /** 구성품 행 — legacy 싱글 구성품/상업멀티 구성 row 동등 (관계 단가 우선, NULL이면 전역가). */
    public record ComponentRow(
            String setModelCode,
            String componentModelCode,
            String name,
            String unit,
            BigDecimal deliveryPrice,
            BigDecimal releasePrice,
            String kind,
            String variant,
            Boolean isDefault,
            BigDecimal defaultQty,
            String specText,
            List<ProductSpecResponse> specs) {
    }

    /** 인상 전 단가 baseline 행 — legacy getPriceIncData_ 동등. */
    public record PriceBaselineRow(String modelCode, String estimateCategory,
            BigDecimal releasePrice, BigDecimal deliveryPrice) {
    }

    /** legacy getSpecDetailMap_ 모델별 상세 사양 sub-object. null scope 는 JSON 에서 생략한다. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record SpecDetail(Map<String, String> home, Map<String, String> single, Map<String, String> comm) {
    }

    /**
     * 카테고리별 카탈로그 — legacy getHomeMulti/getSingleSets/getCommercialMulti/getOldProducts_.
     *
     * @param category HOME_MULTI / SINGLE_SET / COMMERCIAL_MULTI / LEGACY(구형)
     */
    @Operation(summary = "[내부] estimate 카탈로그 벌크 (#30 Sheets→DB)",
            description = "legacy 시트 getter 대체 — 견적 노출(usageScope) 필터 + 시트 순서(display_order) "
                    + "정렬 + 변동DC 분기·사양 파생 포함.")
    @GetMapping("/products")
    @Transactional(readOnly = true)
    public ApiResponse<List<CatalogRow>> products(
            @RequestParam("category") EstimateCategory category,
            @RequestParam(name = "scope", defaultValue = "ESTIMATE") UsageScope scope) {
        // 개발책임자 결정(2026-06-10): 호출 scope + BOTH 노출 품목만, 구글 시트 순서 유지.
        List<Product> products = productRepository.findExposedCatalog(
                category, java.util.List.of(scope, UsageScope.BOTH));

        Map<UUID, Map<String, String>> specByProduct = loadSpecs(
                products.stream().map(Product::getId).toList());

        List<CatalogRow> rows = products.stream()
                .map(p -> {
                    Map<String, String> spec = specByProduct.getOrDefault(p.getId(), Map.of());
                    return new CatalogRow(
                            p.getName(),
                            p.getModelCode(),
                            p.getUnit(),
                            p.getDeliveryPrice(),
                            p.getReleasePrice(),
                            p.getCatL() == null ? null : p.getCatL().getName(),
                            p.getCatM() == null ? null : p.getCatM().getName(),
                            p.getCatS() == null ? null : p.getCatS().getName(),
                            p.getHasVariableDiscount(),
                            p.getSetMaterialKey() == null ? null : p.getSetMaterialKey().name(),
                            p.resolveFixedDiscount().rate(),
                            p.getLegacyDiscountFlag(),
                            p.getRemark(),
                            p.getSpecText() != null ? p.getSpecText() : p.getSpecification(),
                            p.getPyongSize(),
                            spec.get(SPEC_CAPACITY),
                            spec.get(SPEC_MAX_INDOOR),
                            p.getProductType() == null ? null : p.getProductType().name(),
                            p.getStatus());
                })
                .toList();
        return ApiResponse.ok(rows);
    }

    /**
     * 카테고리별 세트 구성품 — legacy getSingleParts/getCommercialParts.
     *
     * <p>관계 단가가 있으면 세트-구성품 문맥 단가를 반환하고, 관계 단가가 NULL인 레거시
     * 세트는 구성품 Product의 전역 단가로 fallback한다. 이 응답은 partner-order bootstrap
     * 캐시의 원천이므로 주문 화면의 품목표·미리보기·확정 단가가 BundleExpander와 같은
     * 관계 단가를 소비하도록 하는 경계다.
     *
     * <p>노출 구분(usageScope) 필터 미적용 의도: 구성품은 사용자 직접 선택 대상이 아니라 이미
     * 노출 필터된 부모 세트(BUNDLE) 전개 시 따라붙는 자식이다. 부모(products endpoint)에서
     * usageScope 필터되므로 구성품 단계는 무관. price-baseline 도 동일(인상 전/후 단가 비교용
     * 전 품목 baseline — 노출 구분과 직교).
     *
     * @param category SINGLE_SET(싱글 구성품) / COMMERCIAL_MULTI(상업멀티 구성)
     */
    @Operation(summary = "[내부] estimate 세트 구성품 벌크 (#30)",
            description = "BundleComponent + 구성품 자체 단가(join) — legacy 구성품 탭 대체.")
    @GetMapping("/components")
    @Transactional(readOnly = true)
    public ApiResponse<List<ComponentRow>> components(@RequestParam("category") EstimateCategory category) {
        ProductCategory parentCategory = switch (category) {
            case SINGLE_SET -> ProductCategory.SINGLE_SET;
            case COMMERCIAL_MULTI -> ProductCategory.COMMERCIAL_MULTI;
            default -> throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "구성품 카테고리는 단일 세트/상업용 멀티만 지원합니다");
        };
        List<Product> parents = productRepository
                .findByProductCategoryAndIsDeletedFalse(parentCategory);
        Map<UUID, String> parentCodeById = parents.stream()
                .filter(p -> p.getModelCode() != null)
                .collect(Collectors.toMap(Product::getId, Product::getModelCode));

        List<BundleComponent> components = bundleComponentRepository
                .findByBundleProductIdIn(parentCodeById.keySet());

        // 구성품 자체 단가/품명 join (legacy 구성품 탭의 납품가/출고가/품명 컬럼)
        Set<String> componentCodes = components.stream()
                .map(BundleComponent::getComponentProductCode)
                .filter(c -> c != null && !c.isBlank())
                .collect(Collectors.toSet());
        Map<String, Product> componentProducts = componentCodes.isEmpty() ? Map.of()
                : productRepository.findByModelCodeInAndIsDeletedFalse(componentCodes).stream()
                        .collect(Collectors.toMap(Product::getModelCode, p -> p, (a, b) -> a));

        // #3 — 구성품별 전체 사양 일괄 로드 (componentProductCode → specs)
        Map<UUID, String> productIdToComponentCode = componentProducts.values().stream()
                .collect(Collectors.toMap(Product::getId, Product::getModelCode, (a, b) -> a));
        Map<String, List<ProductSpecResponse>> specsByComponentCode = new HashMap<>();
        if (!productIdToComponentCode.isEmpty()) {
            for (ProductSpec spec : productSpecRepository
                    .findByProductIdInOrderByDisplayOrderAsc(productIdToComponentCode.keySet())) {
                String code = productIdToComponentCode.get(spec.getProductId());
                if (code != null) {
                    specsByComponentCode.computeIfAbsent(code, k -> new java.util.ArrayList<>())
                            .add(ProductSpecResponse.from(spec));
                }
            }
        }

        List<ComponentRow> rows = components.stream()
                .map(c -> {
                    Product cp = componentProducts.get(c.getComponentProductCode());
                    return new ComponentRow(
                            parentCodeById.get(c.getBundleProductId()),
                            c.getComponentProductCode(),
                            cp == null ? null : cp.getName(),
                            cp == null ? "EA" : cp.getUnit(),
                            firstNonNull(c.getContextDeliveryPrice(),
                                    cp == null ? null : cp.getDeliveryPrice()),
                            firstNonNull(c.getContextReleasePrice(),
                                    cp == null ? null : cp.getReleasePrice()),
                            c.getComponentKind() == null ? null : c.getComponentKind().name(),
                            c.getComponentVariant(),
                            c.getIsDefault(),
                            c.getDefaultQty(),
                            c.getSpecText(),
                            specsByComponentCode.getOrDefault(c.getComponentProductCode(), List.of()));
                })
                .toList();
        return ApiResponse.ok(rows);
    }

    private static BigDecimal firstNonNull(BigDecimal preferred, BigDecimal fallback) {
        return preferred != null ? preferred : fallback;
    }

    /** 종합견적서의 서버 규칙 기반 수량 동기화용 internal read endpoint. */
    @GetMapping("/quantity-sync-rules")
    public ApiResponse<List<QuantitySyncRuleResponse>> quantitySyncRules() {
        if (quantitySyncRuleService == null) {
            return ApiResponse.ok(List.of());
        }
        return ApiResponse.ok(quantitySyncRuleService.list(QuantitySyncEstimateCategory.HOME_MULTI));
    }

    /** 자재가격 — legacy getSingleMatPrices ('싱글 자재가격' 탭). */
    @Operation(summary = "[내부] 싱글 자재가격 벌크 (#30)")
    @GetMapping("/material-prices")
    public ApiResponse<List<MaterialPrice>> materialPrices() {
        return ApiResponse.ok(materialPriceRepository.findAll());
    }

    /** 추천실외기 — legacy getRecommendOduData ('추천실외기' 탭). */
    @Operation(summary = "[내부] 추천실외기 벌크 (#30)")
    @GetMapping("/odu-recommendations")
    public ApiResponse<List<OduRecommendationLookup>> oduRecommendations() {
        return ApiResponse.ok(oduRecommendationLookupRepository.findAll());
    }

    /** 분기계산 — legacy 분기 lookup ('분기계산' 탭). */
    @Operation(summary = "[내부] 분기계산 벌크 (#30)")
    @GetMapping("/branch-pipes")
    public ApiResponse<List<BranchPipeLookup>> branchPipes() {
        return ApiResponse.ok(branchPipeLookupRepository.findAll());
    }

    /** 인상 전 단가 baseline — legacy getPriceIncData_ (비_단가인상 탭 비교). */
    @Operation(summary = "[내부] 인상 전 단가 baseline 벌크 (#30)")
    @GetMapping("/price-baseline")
    @Transactional(readOnly = true)
    public ApiResponse<List<PriceBaselineRow>> priceBaseline() {
        List<PriceHistory> baselines = priceHistoryRepository.findByEffectiveDate(BASELINE_DATE);
        Map<UUID, PriceHistory> byProduct = baselines.stream()
                .collect(Collectors.toMap(PriceHistory::getProductId, ph -> ph, (a, b) -> a));
        List<Product> products = productRepository.findAllById(byProduct.keySet());
        Map<UUID, Product> productById = products.stream()
                .filter(p -> !Boolean.TRUE.equals(p.getIsDeleted()))
                .filter(p -> p.getModelCode() != null)
                .collect(Collectors.toMap(Product::getId, p -> p, (a, b) -> a));
        List<ProductEstimateExposure> exposures = exposureRepository
                .findByProductIdInAndIsDeletedFalse(productById.keySet());
        Set<UUID> exposedProductIds = exposures.stream()
                .map(ProductEstimateExposure::getProductId)
                .collect(Collectors.toSet());
        List<PriceBaselineRow> rows = new ArrayList<>();
        rows.addAll(exposures.stream()
                .map(e -> {
                    Product p = productById.get(e.getProductId());
                    PriceHistory ph = byProduct.get(e.getProductId());
                    return new PriceBaselineRow(p.getModelCode(),
                            e.getEstimateCategory().name(),
                            ph.getReleasePrice(), ph.getDeliveryPrice());
                })
                .toList());
        productById.forEach((productId, product) -> {
            if (exposedProductIds.contains(productId)) {
                return;
            }
            PriceHistory ph = byProduct.get(productId);
            rows.add(new PriceBaselineRow(product.getModelCode(), null,
                    ph.getReleasePrice(), ph.getDeliveryPrice()));
        });
        return ApiResponse.ok(rows);
    }

    /** 사양 상세 맵 — ProductSpec 을 legacy getSpecDetailMap_ 출력 shape 로 reshape. */
    @Operation(summary = "[내부] estimate 사양 상세 맵 벌크 (ProductSpec→getSpecDetailMap_ shape)")
    @GetMapping("/spec-detail-map")
    @Transactional(readOnly = true)
    public ApiResponse<Map<String, SpecDetail>> specDetailMap() {
        List<Product> products = new ArrayList<>();
        products.addAll(productRepository.findByProductCategoryAndIsDeletedFalse(ProductCategory.HOME_MULTI));
        products.addAll(productRepository.findByProductCategoryAndIsDeletedFalse(ProductCategory.SINGLE_SET));
        products.addAll(productRepository.findByProductCategoryAndIsDeletedFalse(ProductCategory.COMMERCIAL_MULTI));

        Map<UUID, Map<String, String>> specByProduct = loadAllSpecs(
                products.stream().map(Product::getId).toList());

        Map<String, SpecDetail> out = new LinkedHashMap<>();
        for (Product product : products) {
            String modelCode = normalizeModelCode(product.getModelCode(), product.getModelName());
            if (modelCode.isBlank()) {
                continue;
            }
            // ProductSpec 이 0건인 모델도 legacy 필드 전체를 "" 로 채운다.
            // 시트 모드에서는 모델 key 자체가 없을 수 있지만 FE 는 양쪽 모두 빈 표("-")로 렌더한다.
            Map<String, String> specs = specByProduct.getOrDefault(product.getId(), Map.of());
            SpecDetail current = out.get(modelCode);
            Map<String, String> home = current == null ? null : current.home();
            Map<String, String> single = current == null ? null : current.single();
            Map<String, String> comm = current == null ? null : current.comm();

            switch (specScope(product)) {
                case HOME -> home = buildHomeSpecMap(product, specs);
                case SINGLE -> single = buildSingleSpecMap(product, specs);
                case COMM -> comm = buildCommSpecMap(product, specs);
                case NONE -> {
                    continue;
                }
            }
            out.put(modelCode, new SpecDetail(home, single, comm));
        }
        return ApiResponse.ok(out);
    }

    private Map<UUID, Map<String, String>> loadSpecs(List<UUID> productIds) {
        if (productIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, Map<String, String>> out = new HashMap<>();
        for (ProductSpec spec : productSpecRepository.findByProductIdInAndSpecKeyIn(
                productIds, List.of(SPEC_CAPACITY, SPEC_MAX_INDOOR))) {
            out.computeIfAbsent(spec.getProductId(), k -> new HashMap<>())
                    .put(spec.getSpecKey(), spec.getSpecValue());
        }
        return out;
    }

    private Map<UUID, Map<String, String>> loadAllSpecs(List<UUID> productIds) {
        if (productIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, Map<String, String>> out = new HashMap<>();
        for (ProductSpec spec : productSpecRepository.findByProductIdInOrderByDisplayOrderAsc(productIds)) {
            out.computeIfAbsent(spec.getProductId(), k -> new HashMap<>())
                    .put(spec.getSpecKey(), spec.getSpecValue());
        }
        return out;
    }

    private static Map<String, String> buildCommSpecMap(Product product, Map<String, String> specs) {
        if (isPanelRow(product)) {
            Map<String, String> out = buildSpecMap(COMM_SPEC_FIELDS, COMM_SPEC_KEY_TO_FIELDS, specs);
            applySpecMap(out, SINGLE_COMM_PANEL_SPEC_KEY_TO_FIELDS, specs);
            return out;
        }
        boolean erv = isErv(product, specs);
        return buildSpecMap(
                erv ? COMM_ERV_SPEC_FIELDS : COMM_SPEC_FIELDS,
                erv ? COMM_ERV_SPEC_KEY_TO_FIELDS : COMM_SPEC_KEY_TO_FIELDS,
                specs);
    }

    private static Map<String, String> buildHomeSpecMap(Product product, Map<String, String> specs) {
        Map<String, String> out = buildSpecMap(HOME_SPEC_FIELDS, HOME_SPEC_KEY_TO_FIELDS, specs);
        if (isPanelRow(product)) {
            applySpecMap(out, HOME_PANEL_SPEC_KEY_TO_FIELDS, specs);
        }
        return out;
    }

    private static Map<String, String> buildSingleSpecMap(Product product, Map<String, String> specs) {
        Map<String, String> out = buildSpecMap(SINGLE_SPEC_FIELDS, SINGLE_SPEC_KEY_TO_FIELDS, specs);
        if (isPanelRow(product)) {
            applySpecMap(out, SINGLE_COMM_PANEL_SPEC_KEY_TO_FIELDS, specs);
        }
        return out;
    }

    private static Map<String, String> buildSpecMap(List<String> fields,
                                                    Map<String, List<String>> specKeyToFields,
                                                    Map<String, String> specs) {
        Map<String, String> out = new LinkedHashMap<>();
        fields.forEach(field -> out.put(field, ""));
        for (Map.Entry<String, List<String>> entry : specKeyToFields.entrySet()) {
            String value = specs.get(entry.getKey());
            putFields(out, entry.getValue(), value);
        }
        return out;
    }

    private static void applySpecMap(Map<String, String> out,
                                     Map<String, List<String>> specKeyToFields,
                                     Map<String, String> specs) {
        for (Map.Entry<String, List<String>> entry : specKeyToFields.entrySet()) {
            putFields(out, entry.getValue(), specs.get(entry.getKey()));
        }
    }

    private static void putFields(Map<String, String> out, List<String> fields, String value) {
        if (value == null) {
            return;
        }
        for (String field : fields) {
            if (out.containsKey(field)) {
                out.put(field, value);
            }
        }
    }

    private static SpecScope specScope(Product product) {
        ProductCategory productCategory = product.getProductCategory();
        if (productCategory == ProductCategory.HOME_MULTI) {
            return SpecScope.HOME;
        }
        if (productCategory == ProductCategory.SINGLE_SET) {
            return SpecScope.SINGLE;
        }
        if (productCategory == ProductCategory.COMMERCIAL_MULTI) {
            return SpecScope.COMM;
        }
        EstimateCategory estimateCategory = product.getEstimateCategory();
        if (estimateCategory == EstimateCategory.HOME_MULTI) {
            return SpecScope.HOME;
        }
        if (estimateCategory == EstimateCategory.SINGLE_SET) {
            return SpecScope.SINGLE;
        }
        if (estimateCategory == EstimateCategory.COMMERCIAL_MULTI) {
            return SpecScope.COMM;
        }
        return SpecScope.NONE;
    }

    private static boolean isErv(Product product, Map<String, String> specs) {
        /*
         * ProductSheetSyncService 는 ERV layout 성능/소비전력 그룹을 joinCols(" / ")로 ProductSpec 에 저장한다.
         * 따라서 품명/모델의 전열교환기·ERV 표식 또는 join 값으로 ERV shape 를 복원한다.
         * 레이아웃은 ERV 이지만 무명칭+단일값인 품목은 오분류 가능하나, 현 데이터에서는 라이브 QA 대상이 아니다.
         */
        String haystack = ((product.getName() == null ? "" : product.getName()) + " "
                + (product.getModelCode() == null ? "" : product.getModelCode()) + " "
                + (product.getModelName() == null ? "" : product.getModelName())).toLowerCase();
        if (haystack.contains("전열교환기") || haystack.contains("erv")) {
            return true;
        }
        return List.of("냉방능력, kcal/h", "난방능력, kcal/h", "냉방소비전력, kW", "난방소비전력, kW")
                .stream()
                .map(specs::get)
                .filter(v -> v != null)
                .anyMatch(v -> v.contains(" / "));
    }

    private static boolean isPanelRow(Product product) {
        String name = product.getName() == null ? "" : product.getName();
        String modelCode = product.getModelCode() == null ? "" : product.getModelCode();
        return name.matches(".*(판넬|판널|패널).*") || modelCode.matches("(?i)PC[0-9].*");
    }

    private static String normalizeModelCode(String modelCode, String fallbackModelName) {
        String key = modelCode == null ? "" : modelCode.trim();
        if (!key.isBlank()) {
            return key;
        }
        return fallbackModelName == null ? "" : fallbackModelName.trim();
    }

    private enum SpecScope {
        HOME,
        SINGLE,
        COMM,
        NONE
    }
}
