package com.samhanair.logis.product.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductStatus;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.service.ProductService;
import com.samhanair.logis.product.web.dto.CreateProductRequest;
import com.samhanair.logis.product.web.dto.LookupRequest;
import com.samhanair.logis.product.web.dto.ProductResponse;
import com.samhanair.logis.product.web.dto.ProductSummaryResponse;
import com.samhanair.logis.product.web.dto.UpdatePriceRequest;
import com.samhanair.logis.product.web.dto.UpdateProductRequest;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.security.permission.PermissionAction;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
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
import org.springframework.web.bind.annotation.RestController;

/**
 * 제품 master CRUD + 가격/태그/단종 부분 수정. 권한 매트릭스:
 * <ul>
 *   <li>MASTER / MANAGER / DEVELOPER — 전체 mutation</li>
 *   <li>ACCOUNTANT — 가격 patch 한정 추가 권한</li>
 *   <li>그 외 (SALES / WAREHOUSE / INVENTORY) — 읽기 전용</li>
 * </ul>
 *
 * <p>SP-D6-2 동적 권한 가드: 조회는 {@code products.list} VIEW, 일반 변경은
 * {@code products.admin} EDIT, 가격 변경은 {@code products.price} EDIT 를
 * {@code @RequirePermission} AOP 로 검증한다.
 */
@RestController
@RequestMapping("/products")
@RequiredArgsConstructor
public class ProductController {

    private static final String CALLER_HEADER = "X-User-Id";
    private static final String ROLE_HEADER   = "X-User-Role";

    private final ProductService productService;

    /**
     * 품목 목록 조회 (어드민/데스크톱 품목관리 화면 전용).
     *
     * <p>categoryId/status/tag/q 기존 필터 + usageScope/category 신규 AND 결합 필터.
     * order-app 및 desktop sales.ts 의 카탈로그 조회는 {@link com.samhanair.logis.product.web.ProductCatalogController}
     * ({@code /api/v1/products})에서 처리하므로 두 경로를 혼동하지 않도록 주의 (사이클2 지적 P3-5, 2026-06-11).
     *
     * <ul>
     *   <li>{@code usageScope} — {@link UsageScope} enum 문자열 (예: {@code PARTNER_ORDER}, {@code BOTH})</li>
     *   <li>{@code category} — {@link ProductCategory} enum 문자열 (예: {@code HOME_MULTI})</li>
     * </ul>
     */
    @GetMapping
    @RequirePermission(page = "products.list", action = PermissionAction.VIEW)
    public ApiResponse<Page<ProductSummaryResponse>> search(
            @RequestParam(required = false) UUID categoryId,
            @RequestParam(required = false) ProductStatus status,
            @RequestParam(required = false) String tagKey,
            @RequestParam(required = false) String tagValue,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) UsageScope usageScope,
            @RequestParam(required = false) ProductCategory category,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        Pageable pageable = PageRequest.of(page, size);
        return ApiResponse.ok(productService.search(categoryId, status, tagKey, tagValue, q,
                usageScope, category, pageable));
    }

    @GetMapping("/{id}")
    @RequirePermission(page = "products.list", action = PermissionAction.VIEW)
    public ApiResponse<ProductResponse> getOne(
            @PathVariable UUID id,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        return ApiResponse.ok(productService.getOne(id));
    }

    /**
     * 모델명 정확 매칭 단건 조회 — gateway 경유 FE 호출용 (Slip 출력 슬라이스 modelName onBlur 흐름).
     * 모든 비-developer-only role 이 조회 가능 (사용자가 직접 입력하는 시나리오, 개발책임자 Q3=B).
     *
     * @param modelName URL 인코딩된 모델명 (예: {@code AJ040RXH4BC1})
     * @return 200, ProductResponse (audit + tags 포함 상세) / 404 NOT_FOUND
     */
    @Operation(summary = "모델명으로 제품 단건 조회",
            description = "Slip 라인 입력 시 modelName onBlur 자동 채움용. 정확 매칭만 (대소문자 구분, 공백 trim).")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "인증/권한 없음"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "모델명에 해당하는 제품이 없습니다")
    })
    @GetMapping("/by-model/{modelName}")
    @RequirePermission(page = "products.list", action = PermissionAction.VIEW)
    public ApiResponse<ProductResponse> getByModelName(@PathVariable String modelName) {
        return ApiResponse.ok(productService.getByModelName(modelName));
    }

    @PostMapping("/lookup")
    @RequirePermission(page = "products.list", action = PermissionAction.VIEW)
    public ApiResponse<List<ProductSummaryResponse>> lookup(@Valid @RequestBody LookupRequest request) {
        return ApiResponse.ok(productService.lookup(request.ids()));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = "products.admin", action = PermissionAction.CREATE)
    public ApiResponse<ProductResponse> create(
            @Valid @RequestBody CreateProductRequest request,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        return ApiResponse.ok(productService.create(request));
    }

    @PatchMapping("/{id}")
    @RequirePermission(page = "products.admin", action = PermissionAction.UPDATE)
    public ApiResponse<ProductResponse> update(@PathVariable UUID id,
                                               @Valid @RequestBody UpdateProductRequest request,
                                               @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        return ApiResponse.ok(productService.update(id, request));
    }

    @PatchMapping("/{id}/price")
    @RequirePermission(page = "products.price", action = PermissionAction.UPDATE)
    public ApiResponse<ProductResponse> updatePrice(@PathVariable UUID id,
                                                    @Valid @RequestBody UpdatePriceRequest request,
                                                    @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        return ApiResponse.ok(productService.updatePrice(id, request));
    }

    @PutMapping("/{id}/tags")
    @RequirePermission(page = "products.admin", action = PermissionAction.UPDATE)
    public ApiResponse<ProductResponse> replaceTags(@PathVariable UUID id,
                                                    @RequestBody Map<String, String> tags,
                                                    @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        return ApiResponse.ok(productService.replaceTags(id, tags));
    }

    @PostMapping("/{id}/discontinue")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @RequirePermission(page = "products.admin", action = PermissionAction.UPDATE)
    public void discontinue(@PathVariable UUID id,
                            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        productService.discontinue(id);
    }

    @PostMapping("/{id}/reactivate")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @RequirePermission(page = "products.admin", action = PermissionAction.UPDATE)
    public void reactivate(@PathVariable UUID id,
                           @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        productService.reactivate(id);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @RequirePermission(page = "products.admin", action = PermissionAction.DELETE)
    public void delete(@PathVariable UUID id,
                       @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
                       @RequestParam(value = "confirmBundleChildrenDeletion", required = false) Boolean confirmBundleChildrenDeletion,
                       @RequestParam(value = "expectedBundleComponentSetToken", required = false) String expectedBundleComponentSetToken,
                       @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        productService.delete(id, callerHeader, confirmBundleChildrenDeletion, expectedBundleComponentSetToken);
    }
}
