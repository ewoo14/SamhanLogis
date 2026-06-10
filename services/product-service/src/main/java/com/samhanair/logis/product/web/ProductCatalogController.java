package com.samhanair.logis.product.web;

import static com.samhanair.logis.product.service.ProductService.escapeLikeWildcards;

import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.ProductSpec;
import com.samhanair.logis.product.domain.SpecKeyTemplate;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.repository.SpecKeyTemplateRepository;
import com.samhanair.logis.product.service.ProductService;
import com.samhanair.logis.product.service.ProductSpecService;
import com.samhanair.logis.product.web.dto.ProductCatalogResponse;
import com.samhanair.logis.product.web.dto.ProductSpecResponse;
import com.samhanair.logis.product.web.dto.SpecKeyTemplateResponse;
import com.samhanair.logis.product.web.dto.UpdateProductUsageRequest;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Phase 6 M1a 카탈로그 endpoint — 9 endpoint (Migration Plan §2.1.7).
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
 *     <li>GET /api/v1/products?usageScope&category — products.list VIEW</li>
 *     <li>PATCH /api/v1/products/{code}/usage — products.admin UPDATE</li>
 *     <li>GET /api/v1/products/{code}/specs — products.list VIEW</li>
 *     <li>POST /api/v1/products/{code}/specs — products.admin CREATE</li>
 *     <li>PATCH /api/v1/products/{code}/specs/{id} — products.admin UPDATE</li>
 *     <li>DELETE /api/v1/products/{code}/specs/{id} — products.admin DELETE</li>
 *     <li>PATCH /api/v1/products/{code}/specs/reorder — products.admin UPDATE</li>
 *     <li>GET /api/v1/spec-key-templates?category — products.list VIEW</li>
 *     <li>POST /api/v1/spec-key-templates/{id}/apply-to-existing?dryRun — products.admin CREATE</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/v1")
public class ProductCatalogController {

    private static final String CALLER_HEADER = "X-User-Id";

    private final ProductRepository productRepository;
    private final ProductSpecService specService;
    private final SpecKeyTemplateRepository templateRepository;
    private final ProductService productService;

    public ProductCatalogController(ProductRepository productRepository,
                                    ProductSpecService specService,
                                    SpecKeyTemplateRepository templateRepository,
                                    ProductService productService) {
        this.productRepository = productRepository;
        this.specService = specService;
        this.templateRepository = templateRepository;
        this.productService = productService;
    }

    /**
     * 카탈로그 목록 조회.
     *
     * <p>GET /api/v1/products?usageScope=BOTH&amp;category=HOME_MULTI&amp;q=AJ040&amp;page=0&amp;size=20
     *
     * <p><b>usageScope IN 확장 시멘틱 (PR-B 2026-06-11, 지적 [10][3])</b>:
     * ESTIMATE → IN (ESTIMATE, BOTH), PARTNER_ORDER → IN (PARTNER_ORDER, BOTH),
     * BOTH·NONE → exact match, null → 전체.
     *
     * <p><b>q 파라미터 (지적 [1][9][15])</b>:
     * modelCode / name LIKE 검색. null/blank → 전체 (신규 품목관리 화면 검색 실효화).
     */
    @GetMapping("/products")
    @RequirePermission(page = "products.list", action = PermissionAction.VIEW)
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
        return productRepository.searchByUsageScope(usageScopeName, estimateCategoryName, qNormalized, pageable)
                .map(ProductCatalogResponse::from);
    }

    /**
     * 품목 노출 범위 수동 override 설정 (PR-B 2026-06-11).
     *
     * <p>usageScope/estimateCategory 를 변경하고 {@code usageScopeManual=true} 를 마킹한다.
     * 이후 시트 sync 가 이 품목의 노출 분류를 덮어쓰지 않는다.
     * NONE/PARTNER_ORDER 선택 시 estimateCategory 가 자동 null 처리된다.
     *
     * <p>구현은 {@link com.samhanair.logis.product.service.ProductService#updateUsage} 에
     * 위임한다 (지적 [6][13][32] — 이중 구현 제거, 응답 DTO 변환만 이 계층에서).
     *
     * @param modelCode 수동 override 대상 품목의 모델코드 (카탈로그 노출 식별자)
     * @param req       새 노출 범위 + 견적 카테고리
     * @return 갱신된 카탈로그 응답 (usageScopeManual=true 포함)
     */
    @PatchMapping("/products/{modelCode}/usage")
    @RequirePermission(page = "products.admin", action = PermissionAction.UPDATE)
    public ProductCatalogResponse changeUsage(@PathVariable @NotBlank String modelCode,
                                              @Valid @RequestBody UpdateProductUsageRequest req) {
        return ProductCatalogResponse.from(
                productService.updateUsageAndReturn(modelCode, req));
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
        try {
            ProductSpec saved = specService.addSpec(modelCode, req.specKey(), req.specValue(),
                    req.unit(), req.displayOrder());
            return ResponseEntity.status(HttpStatus.CREATED).body(ProductSpecResponse.from(saved));
        } catch (IllegalStateException dup) {
            return ResponseEntity.status(HttpStatus.CONFLICT).build();
        }
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
        return templates.stream().map(SpecKeyTemplateResponse::from).toList();
    }

    /** POST /api/v1/spec-key-templates/{id}/apply-to-existing?dryRun=true (G19). */
    @PostMapping("/spec-key-templates/{templateId}/apply-to-existing")
    @RequirePermission(page = "products.admin", action = PermissionAction.CREATE)
    public Map<String, Object> applyTemplateToExisting(@PathVariable UUID templateId,
                                                       @RequestParam(defaultValue = "true") boolean dryRun) {
        return specService.applyTemplateToExisting(templateId, dryRun).toMap();
    }

    // UsageChangeRequest 는 PR-B 에서 UpdateProductUsageRequest 로 대체됨.

    public record SpecCreateRequest(@NotBlank String specKey, String specValue, String unit, Integer displayOrder) {}

    public record SpecEditRequest(String specValue, String unit) {}

    public record ReorderRequest(Map<UUID, Integer> orderMap) {}
}
