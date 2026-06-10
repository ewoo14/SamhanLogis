package com.samhanair.logis.product.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.product.domain.BranchPipeLookup;
import com.samhanair.logis.product.domain.BundleComponent;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.MaterialPrice;
import com.samhanair.logis.product.domain.OduRecommendationLookup;
import com.samhanair.logis.product.domain.PriceHistory;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductSpec;
import com.samhanair.logis.product.repository.BranchPipeLookupRepository;
import com.samhanair.logis.product.repository.BundleComponentRepository;
import com.samhanair.logis.product.repository.MaterialPriceRepository;
import com.samhanair.logis.product.repository.OduRecommendationLookupRepository;
import com.samhanair.logis.product.repository.PriceHistoryRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.repository.ProductSpecRepository;
import io.swagger.v3.oas.annotations.Operation;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
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

    private final ProductRepository productRepository;
    private final ProductSpecRepository productSpecRepository;
    private final BundleComponentRepository bundleComponentRepository;
    private final PriceHistoryRepository priceHistoryRepository;
    private final MaterialPriceRepository materialPriceRepository;
    private final OduRecommendationLookupRepository oduRecommendationLookupRepository;
    private final BranchPipeLookupRepository branchPipeLookupRepository;

    /** 카탈로그 행 — legacy 시트 row 동등 (분류 catL/M/S·disp 는 estimate-app 이 name 으로 계산). */
    public record CatalogRow(
            String name,
            String modelCode,
            String unit,
            BigDecimal deliveryPrice,
            BigDecimal releasePrice,
            Boolean hasVariableDiscount,
            String materialKey,
            BigDecimal fixedDiscountRate,
            Boolean legacyDiscountFlag,
            String remark,
            String specText,
            BigDecimal pyongSize,
            String capacity,
            String maxIndoor,
            String productType) {
    }

    /** 구성품 행 — legacy 싱글 구성품/상업멀티 구성 row 동등 (자체 단가는 product join). */
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
            String specText) {
    }

    /** 인상 전 단가 baseline 행 — legacy getPriceIncData_ 동등. */
    public record PriceBaselineRow(String modelCode, String estimateCategory,
            BigDecimal releasePrice, BigDecimal deliveryPrice) {
    }

    /**
     * 카테고리별 카탈로그 — legacy getHomeMulti/getSingleSets/getCommercialMulti/getOldProducts_.
     *
     * @param category HOME_MULTI / SINGLE_SET / COMMERCIAL_MULTI / LEGACY(구형)
     */
    @Operation(summary = "[내부] estimate 카탈로그 벌크 (#30 Sheets→DB)",
            description = "legacy 시트 getter 대체 — 변동DC 분기·사양 파생 포함 전량 반환.")
    @GetMapping("/products")
    @Transactional(readOnly = true)
    public ApiResponse<List<CatalogRow>> products(@RequestParam("category") EstimateCategory category) {
        ProductCategory productCategory = switch (category) {
            case HOME_MULTI -> ProductCategory.HOME_MULTI;
            case SINGLE_SET -> ProductCategory.SINGLE_SET;
            case COMMERCIAL_MULTI -> ProductCategory.COMMERCIAL_MULTI;
            case LEGACY -> ProductCategory.OLD;
            default -> throw new IllegalArgumentException("지원하지 않는 카테고리: " + category);
        };
        List<Product> products = productRepository
                .findByProductCategoryAndIsDeletedFalse(productCategory);

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
                            p.getHasVariableDiscount(),
                            p.getSetMaterialKey() == null ? null : p.getSetMaterialKey().name(),
                            p.getFixedDiscountRate(),
                            p.getLegacyDiscountFlag(),
                            p.getRemark(),
                            p.getSpecText() != null ? p.getSpecText() : p.getSpecification(),
                            p.getPyongSize(),
                            spec.get(SPEC_CAPACITY),
                            spec.get(SPEC_MAX_INDOOR),
                            p.getProductType() == null ? null : p.getProductType().name());
                })
                .toList();
        return ApiResponse.ok(rows);
    }

    /**
     * 카테고리별 세트 구성품 — legacy getSingleParts/getCommercialParts.
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
            default -> throw new IllegalArgumentException("구성품 카테고리는 SINGLE_SET/COMMERCIAL_MULTI 만 지원");
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

        List<ComponentRow> rows = components.stream()
                .map(c -> {
                    Product cp = componentProducts.get(c.getComponentProductCode());
                    return new ComponentRow(
                            parentCodeById.get(c.getBundleProductId()),
                            c.getComponentProductCode(),
                            cp == null ? null : cp.getName(),
                            cp == null ? "EA" : cp.getUnit(),
                            cp == null ? null : cp.getDeliveryPrice(),
                            cp == null ? null : cp.getReleasePrice(),
                            c.getComponentKind() == null ? null : c.getComponentKind().name(),
                            c.getComponentVariant(),
                            c.getIsDefault(),
                            c.getDefaultQty(),
                            c.getSpecText());
                })
                .toList();
        return ApiResponse.ok(rows);
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
        List<PriceBaselineRow> rows = products.stream()
                .filter(p -> !Boolean.TRUE.equals(p.getIsDeleted()))
                .filter(p -> p.getModelCode() != null && p.getEstimateCategory() != null)
                .map(p -> {
                    PriceHistory ph = byProduct.get(p.getId());
                    return new PriceBaselineRow(p.getModelCode(),
                            p.getEstimateCategory().name(),
                            ph.getReleasePrice(), ph.getDeliveryPrice());
                })
                .toList();
        return ApiResponse.ok(rows);
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
}
