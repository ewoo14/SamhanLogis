package com.samhanair.logis.product.web;

import static com.samhanair.logis.product.service.ProductService.escapeLikeWildcards;

import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.BundleComponent;
import com.samhanair.logis.product.domain.BundleComponentConsentToken;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductEstimateExposure;
import com.samhanair.logis.product.domain.ProductSpec;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.domain.SpecKeyTemplate;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.realtime.ProductCatalogChangePublisher;
import com.samhanair.logis.product.repository.BundleComponentRepository;
import com.samhanair.logis.product.repository.ProductEstimateExposureRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.repository.SpecKeyTemplateRepository;
import com.samhanair.logis.product.service.BundleComponentService;
import com.samhanair.logis.product.service.ProductService;
import com.samhanair.logis.product.service.ProductSpecService;
import com.samhanair.logis.product.web.dto.BundleComponentRequest;
import com.samhanair.logis.product.web.dto.BundleComponentResponse;
import com.samhanair.logis.product.web.dto.DisplayOrderRequest;
import com.samhanair.logis.product.web.dto.ProductCatalogResponse;
import com.samhanair.logis.product.web.dto.ProductSpecResponse;
import com.samhanair.logis.product.web.dto.SpecKeyTemplateResponse;
import com.samhanair.logis.product.web.dto.UpdateProductClassificationRequest;
import com.samhanair.logis.product.web.dto.UpdateProductFixedDiscountRequest;
import com.samhanair.logis.product.web.dto.UpdateProductUsageRequest;
import com.samhanair.logis.product.web.dto.UpdateProductVariableDiscountRequest;
import com.samhanair.logis.product.web.dto.UpdateProductGoodsTypeRequest;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.RestController;

/**
 * Phase 6 M1a 카탈로그 endpoint — 9+4 endpoint (Migration Plan §2.1.7 + §1b/1c/1d 2026-06-11).
 *
 * <p>모든 응답은 {@code modelCode} 기반 (UUID 비공개 — feedback_uuid_no_user_visibility.md).
 * 이 값은 이카운트 품목 신원 규칙상 {@code product.modelCode} 가 비어 있으면
 * {@code product.modelName} 으로 fallback 한 사용자 노출 식별자이며, mutation path 도
 * 동일 fallback 조회 규칙으로 왕복 정합을 보장한다.
 * 조회는 {@code products.list} VIEW, 운영 변경은 {@code products.admin} CREATE/UPDATE/DELETE
 * 권한을 {@code @RequirePermission} AOP 로 검증한다.
 *
 * <p>endpoint:
 * <ul>
 *     <li>GET /api/v1/products?usageScope&amp;category — products.list VIEW</li>
 *     <li>PATCH /api/v1/products/{code}/usage — products.admin UPDATE</li>
 *     <li>DELETE /api/v1/products/{code}/usage — products.admin UPDATE</li>
 *     <li>PATCH /api/v1/products/{code}/variable-discount — products.admin UPDATE</li>
 *     <li>DELETE /api/v1/products/{code}/variable-discount — products.admin UPDATE</li>
 *     <li>PATCH /api/v1/products/{code}/fixed-discount — products.admin UPDATE</li>
 *     <li>GET /api/v1/products/{code}/specs — products.list VIEW</li>
 *     <li>POST /api/v1/products/{code}/specs — products.admin CREATE</li>
 *     <li>PATCH /api/v1/products/{code}/specs/{id} — products.admin UPDATE</li>
 *     <li>DELETE /api/v1/products/{code}/specs/{id} — products.admin DELETE</li>
 *     <li>PATCH /api/v1/products/{code}/specs/reorder — products.admin UPDATE</li>
 *     <li>GET /api/v1/spec-key-templates?category — products.list VIEW</li>
 *     <li>POST /api/v1/spec-key-templates/{id}/apply-to-existing?dryRun — products.admin CREATE</li>
 *     <li>GET /api/v1/products/{code}/components — products.list VIEW (§1c)</li>
 *     <li>PUT /api/v1/products/{code}/components — products.admin UPDATE (§1c)</li>
 *     <li>PUT /api/v1/products/display-orders — products.admin UPDATE (§1d)</li>
 * </ul>
 *
 * <p><b>게이트웨이 라우팅 주의 (§1c/§1d, #460 교훈)</b>:
 * 본 컨트롤러는 {@code @RequestMapping("/api/v1")} 풀패스를 사용한다.
 * {@code /api/v1/products/&#42;/components} 경로는 api-gateway 의 {@code product-specs-v1} 라우트
 * (Path=/api/v1/products/&#42;/specs,/api/v1/products/&#42;/specs/**) 와 세그먼트가 달라 매칭되지 않으므로
 * 별도 {@code product-components-v1} 라우트 추가가 필요하다.
 * {@code /api/v1/products/display-orders} 는 {@code product-service-v1}(strip=2) 경로 통해 도달하면
 * {@code /products/display-orders} 가 되어 컨트롤러 매핑 {@code /api/v1/products/display-orders} 와
 * 불일치 — 별도 no-strip 라우트 {@code product-display-orders-v1} 추가가 필요하다.
 */
@RestController
@RequestMapping("/api/v1")
@Validated
public class ProductCatalogController {

    private static final String CALLER_HEADER = "X-User-Id";

    private final ProductRepository productRepository;
    private final ProductSpecService specService;
    private final SpecKeyTemplateRepository templateRepository;
    private final ProductService productService;
    private final BundleComponentService bundleComponentService;
    private final BundleComponentRepository bundleComponentRepository;
    private final ProductEstimateExposureRepository exposureRepository;
    private final ProductCatalogChangePublisher catalogChangePublisher;

    public ProductCatalogController(ProductRepository productRepository,
                                    ProductSpecService specService,
                                    SpecKeyTemplateRepository templateRepository,
                                    ProductService productService,
                                    BundleComponentService bundleComponentService,
                                    BundleComponentRepository bundleComponentRepository,
                                    ProductEstimateExposureRepository exposureRepository,
                                    ProductCatalogChangePublisher catalogChangePublisher) {
        this.productRepository = productRepository;
        this.specService = specService;
        this.templateRepository = templateRepository;
        this.productService = productService;
        this.bundleComponentService = bundleComponentService;
        this.bundleComponentRepository = bundleComponentRepository;
        this.exposureRepository = exposureRepository;
        this.catalogChangePublisher = catalogChangePublisher;
    }

    /**
     * 카탈로그 목록 조회 — productType/componentCount 포함 (§1b 2026-06-11).
     *
     * <p>GET /api/v1/products?usageScope=BOTH&amp;category=HOME_MULTI&amp;q=AJ040&amp;page=0&amp;size=20
     *
     * <p><b>usageScope IN 확장 시멘틱 (PR-B 2026-06-11, 지적 [10][3])</b>:
     * ESTIMATE → IN (ESTIMATE, BOTH), PARTNER_ORDER → IN (PARTNER_ORDER, BOTH),
     * BOTH·NONE → exact match, null → 전체.
     *
     * <p><b>q 파라미터 (지적 [1][9][15])</b>:
     * modelCode / name LIKE 검색. null/blank → 전체 (신규 품목관리 화면 검색 실효화).
     *
     * <p><b>componentCount N+1 방지 (§1b)</b>:
     * 페이지 내 BUNDLE 품목들의 UUID 를 모아 BundleComponentRepository 벌크 count 1쿼리로
     * 구성품 수를 채운다. SINGLE 품목은 0 으로 처리.
     */
    @GetMapping("/products")
    @RequirePermission(page = "products.list", action = PermissionAction.VIEW)
    @Transactional(readOnly = true)
    public Page<ProductCatalogResponse> listProducts(
            @RequestParam(required = false) UsageScope usageScope,
            @RequestParam(required = false, name = "category") EstimateCategory estimateCategory,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        Pageable pageable = PageRequest.of(page, size);
        String usageScopeName = usageScope == null ? null : usageScope.name();
        String estimateCategoryName = estimateCategory == null ? null : estimateCategory.name();
        // LIKE 와일드카드(\, %, _) 이스케이프 후 바인딩 (사이클2 지적 P3-4, 2026-06-11)
        String qNormalized = (q == null || q.isBlank()) ? null : escapeLikeWildcards(q.trim());

        // P2-2 N+1 방지: searchByUsageScope 가 반환한 Page<Product> 의 id 순서를 유지한다.
        // 기존 코드는 page.getContent() 의 각 BUNDLE 행마다 findByCatalogExposedModelCodeAndIsDeletedFalse 를
        // 2회 호출하여 N+1 을 유발했다. 여기서는 id 집합 기준 catL/M/S 선로딩 + 구성품 count 벌크로 대체한다.
        Page<Product> productPage = productRepository
                .searchByUsageScope(usageScopeName, estimateCategoryName, qNormalized, pageable);
        List<Product> products = loadProductsWithClassifications(productPage.getContent());

        // BUNDLE UUID 집합 → 벌크 count 1쿼리 (재조회 없음)
        Set<UUID> bundleIds = products.stream()
                .filter(p -> p.getProductType() == ProductType.BUNDLE)
                .map(Product::getId)
                .collect(Collectors.toSet());

        Map<UUID, List<BundleComponent>> componentsByBundleId = bundleIds.isEmpty()
                ? Map.of()
                : bundleComponentRepository.findActiveByBundleProductIdIn(bundleIds).stream()
                        .collect(Collectors.groupingBy(BundleComponent::getBundleProductId));

        Map<UUID, List<ProductEstimateExposure>> exposuresByProductId = products.isEmpty()
                ? Map.of()
                : exposureRepository.findByProductIdInAndIsDeletedFalse(
                                products.stream().map(Product::getId).toList())
                        .stream()
                        .collect(Collectors.groupingBy(ProductEstimateExposure::getProductId));

        // DTO 변환 + componentCount 주입
        List<ProductCatalogResponse> enriched = products.stream()
                .map(p -> {
                    ProductCatalogResponse r = ProductCatalogResponse.from(
                            p, exposuresByProductId.getOrDefault(p.getId(), List.of()));
                    if (p.getProductType() != ProductType.BUNDLE) {
                        return r;
                    }
                    List<BundleComponent> components = componentsByBundleId.getOrDefault(p.getId(), List.of());
                    return r.withComponentCount(components.size(), BundleComponentConsentToken.from(components));
                })
                .toList();

        return new org.springframework.data.domain.PageImpl<>(enriched,
                productPage.getPageable(), productPage.getTotalElements());
    }

    private List<Product> loadProductsWithClassifications(List<Product> products) {
        if (products.isEmpty()) {
            return products;
        }
        Map<UUID, Product> fetchedById = productRepository.findAllWithClassificationsByIdIn(
                        products.stream().map(Product::getId).toList())
                .stream()
                .collect(Collectors.toMap(Product::getId, Function.identity()));
        return products.stream()
                .map(product -> fetchedById.getOrDefault(product.getId(), product))
                .toList();
    }

    /**
     * 품목 노출 범위 수동 override 설정 (PR-B 2026-06-11).
     *
     * <p>usageScope/estimateCategory 를 변경하고 {@code usageScopeManual=true} 를 마킹한다.
     * 이후 시트 sync 가 이 품목의 노출 분류를 덮어쓰지 않는다.
     * NONE/PARTNER_ORDER 선택 시 estimateCategory 가 자동 null 처리된다.
     *
     * <p>구현은 {@link com.samhanair.logis.product.service.ProductService#updateUsageAndReturn} 에
     * 위임한다 (지적 [6][13][32] — 이중 구현 제거, 응답 DTO 변환만 이 계층에서).
     *
     * @param modelCode 수동 override 대상 품목의 모델코드 (카탈로그 노출 식별자)
     * @param req       새 노출 범위 + 견적 카테고리
     * @return 갱신된 카탈로그 응답 (usageScopeManual=true 포함)
     */
    @PatchMapping("/products/{modelCode}/usage")
    @RequirePermission(page = "products.admin", action = PermissionAction.UPDATE)
    @Transactional
    public ProductCatalogResponse changeUsage(@PathVariable @NotBlank String modelCode,
                                              @Valid @RequestBody UpdateProductUsageRequest req) {
        Product product = productService.updateUsageAndReturn(modelCode, req);
        ProductCatalogResponse response = ProductCatalogResponse.from(
                product, exposureRepository.findByProductIdAndIsDeletedFalse(product.getId()));
        // §2-2 실시간 publish — usage PATCH 성공 시 카탈로그 목록 invalidate 트리거
        // P3-1: ProductCatalogChangePublisher 단일 경로 통일 (트랜잭션 종료 후 발화)
        catalogChangePublisher.publishCatalogChanged(modelCode);
        return response;
    }

    /**
     * 품목 노출 범위 수동 override 해제 (PR-B 2026-06-11).
     *
     * <p>{@code usageScopeManual=false} 로 복귀. 다음 시트 sync 에서 시트 기준으로 재분류된다.
     *
     * @param modelCode override 해제 대상 품목의 모델코드 (카탈로그 노출 식별자)
     */
    @DeleteMapping("/products/{modelCode}/usage")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @RequirePermission(page = "products.admin", action = PermissionAction.UPDATE)
    public void clearUsage(@PathVariable @NotBlank String modelCode) {
        productService.clearUsageOverride(modelCode);
        // §2-2 실시간 publish — usage DELETE 성공 시 카탈로그 목록 invalidate 트리거
        // P3-1: ProductCatalogChangePublisher 단일 경로 통일 (트랜잭션 종료 후 발화)
        catalogChangePublisher.publishCatalogChanged(modelCode);
    }

    /**
     * 품목 변동DC 수동 override 설정 (V19, 2026-06-17).
     *
     * <p>hasVariableDiscount 를 변경하고 {@code variableDiscountManual=true} 를 마킹한다.
     * 이후 시트 sync 가 이 품목의 변동DC 값을 덮어쓰지 않는다.
     *
     * @param modelCode 수동 override 대상 품목의 모델코드 (카탈로그 노출 식별자)
     * @param req       새 변동DC 적용 여부
     * @return 갱신된 카탈로그 응답 (variableDiscountManual=true 포함)
     */
    @PatchMapping("/products/{modelCode}/variable-discount")
    @RequirePermission(page = "products.admin", action = PermissionAction.UPDATE)
    @Transactional
    public ProductCatalogResponse changeVariableDiscount(@PathVariable @NotBlank String modelCode,
                                                         @Valid @RequestBody UpdateProductVariableDiscountRequest req) {
        Product product = productService.updateVariableDiscountAndReturn(modelCode, req);
        ProductCatalogResponse response = ProductCatalogResponse.from(
                product, exposureRepository.findByProductIdAndIsDeletedFalse(product.getId()));
        catalogChangePublisher.publishCatalogChanged(modelCode);
        return response;
    }

    /** 견적품목 메뉴의 상품/비상품 선언을 품목 마스터의 goodsType에 저장한다. */
    @PatchMapping("/products/{modelCode}/goods-type")
    @RequirePermission(page = "products.admin", action = PermissionAction.UPDATE)
    @Transactional
    public ProductCatalogResponse changeGoodsType(@PathVariable @NotBlank String modelCode,
                                                  @Valid @RequestBody UpdateProductGoodsTypeRequest req) {
        Product product = productService.updateGoodsTypeAndReturn(modelCode, req);
        ProductCatalogResponse response = ProductCatalogResponse.from(
                product, exposureRepository.findByProductIdAndIsDeletedFalse(product.getId()));
        catalogChangePublisher.publishCatalogChanged(modelCode);
        return response;
    }

    /** 품목별 L/M/S 분류를 FE F1-b PATCH body 계약 그대로 저장한다. */
    @PatchMapping("/products/{modelCode}/classification")
    @RequirePermission(page = "products.admin", action = PermissionAction.UPDATE)
    @Transactional
    public ProductCatalogResponse changeClassification(@PathVariable @NotBlank String modelCode,
                                                       @Valid @RequestBody UpdateProductClassificationRequest req) {
        Product product = productService.updateClassificationAndFixedDiscount(modelCode, req);
        ProductCatalogResponse response = ProductCatalogResponse.from(
                product, exposureRepository.findByProductIdAndIsDeletedFalse(product.getId()));
        catalogChangePublisher.publishCatalogChanged(modelCode);
        return response;
    }

    /** 품목별 0~100 percent 고정DC율을 인라인 자동저장 계약 그대로 저장한다. */
    @PatchMapping("/products/{modelCode}/fixed-discount")
    @RequirePermission(page = "products.admin", action = PermissionAction.UPDATE)
    @Transactional
    public ProductCatalogResponse changeFixedDiscount(@PathVariable @NotBlank String modelCode,
                                                      @Valid @RequestBody UpdateProductFixedDiscountRequest req) {
        Product product = productService.updateFixedDiscountAndReturn(modelCode, req);
        ProductCatalogResponse response = ProductCatalogResponse.from(
                product, exposureRepository.findByProductIdAndIsDeletedFalse(product.getId()));
        catalogChangePublisher.publishCatalogChanged(modelCode);
        return response;
    }

    @DeleteMapping("/products/{modelCode}/variable-discount")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @RequirePermission(page = "products.admin", action = PermissionAction.UPDATE)
    public void clearVariableDiscount(@PathVariable @NotBlank String modelCode) {
        productService.clearVariableDiscountOverride(modelCode);
        catalogChangePublisher.publishCatalogChanged(modelCode);
    }

    @GetMapping("/products/{modelCode}/specs")
    @RequirePermission(page = "products.list", action = PermissionAction.VIEW)
    public List<ProductSpecResponse> listSpecs(@PathVariable @NotBlank String modelCode) {
        return specService.listByModelCode(modelCode).stream()
                .map(ProductSpecResponse::from)
                .toList();
    }

    /** POST /api/v1/products/{code}/specs — 409 on duplicate specKey (G18). */
    @PostMapping("/products/{modelCode}/specs")
    @RequirePermission(page = "products.admin", action = PermissionAction.CREATE)
    public ResponseEntity<ProductSpecResponse> addSpec(@PathVariable @NotBlank String modelCode,
                                                       @Valid @RequestBody SpecCreateRequest req) {
        ProductSpec saved = specService.addSpec(modelCode, req.specKey(), req.specValue(),
                req.unit(), req.displayOrder());
        return ResponseEntity.status(HttpStatus.CREATED).body(ProductSpecResponse.from(saved));
    }

    @PatchMapping("/products/{modelCode}/specs/{specId}")
    @RequirePermission(page = "products.admin", action = PermissionAction.UPDATE)
    public ProductSpecResponse editSpec(@PathVariable @NotBlank String modelCode,
                                        @PathVariable UUID specId,
                                        @Valid @RequestBody SpecEditRequest req) {
        ProductSpec edited = specService.editSpec(modelCode, specId, req.specValue(), req.unit());
        return ProductSpecResponse.from(edited);
    }

    /** DELETE /api/v1/products/{code}/specs/{id} — X-User-Id 로 soft-delete actor 를 기록한다. */
    @DeleteMapping("/products/{modelCode}/specs/{specId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @RequirePermission(page = "products.admin", action = PermissionAction.DELETE)
    public void deleteSpec(@PathVariable @NotBlank String modelCode,
                           @PathVariable UUID specId,
                           @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        specService.deleteSpec(modelCode, specId, callerHeader == null ? "system" : callerHeader);
    }

    /** PATCH /api/v1/products/{code}/specs/reorder — body: {"orderMap": {"<uuid>": 1, ...}}. */
    @PatchMapping("/products/{modelCode}/specs/reorder")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @RequirePermission(page = "products.admin", action = PermissionAction.UPDATE)
    public void reorderSpecs(@PathVariable @NotBlank String modelCode,
                             @RequestBody ReorderRequest req) {
        specService.reorder(modelCode, req.orderMap());
    }

    /** GET /api/v1/spec-key-templates?category=HOME_MULTI. */
    @GetMapping("/spec-key-templates")
    @RequirePermission(page = "products.list", action = PermissionAction.VIEW)
    public List<SpecKeyTemplateResponse> listTemplates(
            @RequestParam(required = false, name = "category") EstimateCategory estimateCategory) {
        List<SpecKeyTemplate> templates = (estimateCategory == null)
                ? templateRepository.findAll()
                : templateRepository.findByEstimateCategoryOrderByDisplayOrderAsc(estimateCategory);
        return templates.stream()
                .sorted(Comparator.comparing(SpecKeyTemplate::getEstimateCategory)
                        .thenComparing(SpecKeyTemplate::getDisplayOrder)
                        .thenComparing(SpecKeyTemplate::getSpecKey))
                .map(SpecKeyTemplateResponse::from)
                .toList();
    }

    /** POST /api/v1/spec-key-templates/{id}/apply-to-existing?dryRun=true (G19). */
    @PostMapping("/spec-key-templates/{templateId}/apply-to-existing")
    @RequirePermission(page = "products.admin", action = PermissionAction.CREATE)
    public Map<String, Object> applyTemplateToExisting(@PathVariable UUID templateId,
                                                       @RequestParam(defaultValue = "true") boolean dryRun) {
        return specService.applyTemplateToExisting(templateId, dryRun).toMap();
    }

    // ============================================================
    // §1c 구성품 CRUD (BUNDLE 전용)
    // ============================================================

    /**
     * BUNDLE 구성품 목록 조회 (§1c 2026-06-11).
     *
     * <p>GET /api/v1/products/{modelCode}/components
     *
     * <p>대상 품목이 BUNDLE 이 아니어도 빈 목록을 반환한다 (단, 실제 구성품이 존재하는 경우는
     * 품목이 BUNDLE 임을 뜻하므로 정합 문제 없음).
     *
     * @param modelCode 카탈로그 노출 식별자
     * @return 구성품 목록 (구성 모델코드/명칭/수량/순서/옵션 메타)
     */
    @GetMapping("/products/{modelCode}/components")
    @RequirePermission(page = "products.list", action = PermissionAction.VIEW)
    public List<BundleComponentResponse> listComponents(@PathVariable @NotBlank String modelCode) {
        return bundleComponentService.listComponents(modelCode);
    }

    /**
     * BUNDLE 구성품 replace-all (§1c 2026-06-11).
     *
     * <p>PUT /api/v1/products/{modelCode}/components
     *
     * <p>기존 구성품 전량을 soft-delete 후 전달된 배열로 교체한다.
     * 표시 순서는 서버가 종류순 + 종류 내 기본 먼저 + 요청 내 상대 순서 기준으로 정규화한다.
     *
     * <ul>
     *   <li>대상 품목이 BUNDLE 아님 → 409 CONFLICT</li>
     *   <li>구성 모델코드가 활성 품목으로 해소 안 됨 → 400 BAD_REQUEST</li>
     *   <li>자기 자신 포함 → 400 BAD_REQUEST</li>
     *   <li>빈 배열 → 400 BAD_REQUEST (전개 불능 세트 방지)</li>
     * </ul>
     *
     * @param modelCode    대상 BUNDLE 모델코드
     * @param items        replace-all 구성품 목록 (인덱스=순서)
     * @param callerHeader X-User-Id — 기존 구성품 soft-delete actor 로 기록 (P3-3)
     * @return 갱신된 구성품 목록
     */
    @PutMapping("/products/{modelCode}/components")
    @RequirePermission(page = "products.admin", action = PermissionAction.UPDATE)
    public List<BundleComponentResponse> replaceComponents(
            @PathVariable @NotBlank String modelCode,
            @Valid @RequestBody List<BundleComponentRequest> items,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return bundleComponentService.replaceComponents(modelCode, items, callerHeader);
    }

    // ============================================================
    // §1d 표시 순서 일괄 조정
    // ============================================================

    /**
     * 품목 표시 순서 일괄 갱신 (§1d 2026-06-11).
     *
     * <p>PUT /api/v1/products/display-orders
     *
     * <p>body: [{modelCode, displayOrder}, ...]. 전건 검증 후 일괄 적용 (부분 적용 금지).
     * 미존재 modelCode 가 하나라도 있으면 404 NOT_FOUND 를 반환하고 전체를 롤백한다.
     *
     * @param requests 모델코드 + displayOrder 목록
     */
    @PutMapping("/products/display-orders")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @RequirePermission(page = "products.admin", action = PermissionAction.UPDATE)
    public void updateDisplayOrders(@Valid @RequestBody List<DisplayOrderRequest> requests) {
        bundleComponentService.updateDisplayOrders(requests);
    }

    // UsageChangeRequest 는 PR-B 에서 UpdateProductUsageRequest 로 대체됨.

    public record SpecCreateRequest(@NotBlank String specKey, @NotNull String specValue,
                                    String unit, Integer displayOrder) {}

    public record SpecEditRequest(String specValue, String unit) {}

    public record ReorderRequest(Map<UUID, Integer> orderMap) {}
}
