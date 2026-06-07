package com.samhanair.logis.product.web;

import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductSpec;
import com.samhanair.logis.product.domain.SpecKeyTemplate;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.repository.SpecKeyTemplateRepository;
import com.samhanair.logis.product.service.ProductSpecService;
import com.samhanair.logis.product.web.dto.ProductCatalogResponse;
import com.samhanair.logis.product.web.dto.ProductSpecResponse;
import com.samhanair.logis.product.web.dto.SpecKeyTemplateResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import jakarta.persistence.EntityNotFoundException;
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

    public ProductCatalogController(ProductRepository productRepository,
                                    ProductSpecService specService,
                                    SpecKeyTemplateRepository templateRepository) {
        this.productRepository = productRepository;
        this.specService = specService;
        this.templateRepository = templateRepository;
    }

    /** GET /api/v1/products?usageScope=BOTH&category=HOME_MULTI&page=0&size=20. */
    @GetMapping("/products")
    @RequirePermission(page = "products.list", action = PermissionAction.VIEW)
    public Page<ProductCatalogResponse> listProducts(
            @RequestParam(required = false) UsageScope usageScope,
            @RequestParam(required = false, name = "category") EstimateCategory estimateCategory,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        Pageable pageable = PageRequest.of(page, size);
        return productRepository.searchByUsageScope(usageScope, estimateCategory, pageable)
                .map(ProductCatalogResponse::from);
    }

    /** PATCH /api/v1/products/{code}/usage — admin only (운영 분류 재조정). */
    @PatchMapping("/products/{modelCode}/usage")
    @RequirePermission(page = "products.admin", action = PermissionAction.UPDATE)
    public ProductCatalogResponse changeUsage(@PathVariable @NotBlank String modelCode,
                                              @Valid @RequestBody UsageChangeRequest req) {
        Product p = productRepository.findByModelCodeAndIsDeletedFalse(modelCode)
                .orElseThrow(() -> new EntityNotFoundException("Product 없음: " + modelCode));
        p.changeUsage(req.usageScope(), req.estimateCategory());
        productRepository.save(p);
        return ProductCatalogResponse.from(p);
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

    public record UsageChangeRequest(UsageScope usageScope, EstimateCategory estimateCategory) {}

    public record SpecCreateRequest(@NotBlank String specKey, String specValue, String unit, Integer displayOrder) {}

    public record SpecEditRequest(String specValue, String unit) {}

    public record ReorderRequest(Map<UUID, Integer> orderMap) {}
}
