package com.samhanair.logis.product.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.product.domain.ProductStatus;
import com.samhanair.logis.product.service.ProductService;
import com.samhanair.logis.product.web.dto.CreateProductRequest;
import com.samhanair.logis.product.web.dto.LookupRequest;
import com.samhanair.logis.product.web.dto.ProductResponse;
import com.samhanair.logis.product.web.dto.ProductSummaryResponse;
import com.samhanair.logis.product.web.dto.UpdatePriceRequest;
import com.samhanair.logis.product.web.dto.UpdateProductRequest;
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
import org.springframework.security.access.prepost.PreAuthorize;
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
 * <p>SP-D4 동적 권한 이중 가드:
 * <ul>
 *   <li>기존 {@code @PreAuthorize} 보존 (regression 0)</li>
 *   <li>GET 조회 → {@link ProductPermissionGuard#checkView(String, String)} (PAGE_LIST)</li>
 *   <li>POST/PATCH/DELETE write → {@link ProductPermissionGuard#checkEdit(String, String)}</li>
 * </ul>
 */
@RestController
@RequestMapping("/products")
@RequiredArgsConstructor
public class ProductController {

    private static final String CALLER_HEADER = "X-User-Id";
    private static final String ROLE_HEADER   = "X-User-Role";

    private final ProductService productService;
    private final ProductPermissionGuard productPermissionGuard;

    @GetMapping
    public ApiResponse<Page<ProductSummaryResponse>> search(
            @RequestParam(required = false) UUID categoryId,
            @RequestParam(required = false) ProductStatus status,
            @RequestParam(required = false) String tagKey,
            @RequestParam(required = false) String tagValue,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        productPermissionGuard.checkView(roleHeader, ProductPermissionGuard.PAGE_LIST);
        Pageable pageable = PageRequest.of(page, size);
        return ApiResponse.ok(productService.search(categoryId, status, tagKey, tagValue, q, pageable));
    }

    @GetMapping("/{id}")
    public ApiResponse<ProductResponse> getOne(
            @PathVariable UUID id,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        productPermissionGuard.checkView(roleHeader, ProductPermissionGuard.PAGE_LIST);
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
    @PreAuthorize("hasAnyRole('MASTER','MANAGER','DEVELOPER','SALES','ACCOUNTANT','WAREHOUSE','INVENTORY')")
    public ApiResponse<ProductResponse> getByModelName(@PathVariable String modelName) {
        return ApiResponse.ok(productService.getByModelName(modelName));
    }

    @PostMapping("/lookup")
    public ApiResponse<List<ProductSummaryResponse>> lookup(@Valid @RequestBody LookupRequest request) {
        return ApiResponse.ok(productService.lookup(request.ids()));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('MASTER','MANAGER','DEVELOPER')")
    public ApiResponse<ProductResponse> create(
            @Valid @RequestBody CreateProductRequest request,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        productPermissionGuard.checkEdit(roleHeader, ProductPermissionGuard.PAGE_ADMIN);
        return ApiResponse.ok(productService.create(request));
    }

    @PatchMapping("/{id}")
    @PreAuthorize("hasAnyRole('MASTER','MANAGER','DEVELOPER')")
    public ApiResponse<ProductResponse> update(@PathVariable UUID id,
                                               @Valid @RequestBody UpdateProductRequest request) {
        return ApiResponse.ok(productService.update(id, request));
    }

    @PatchMapping("/{id}/price")
    @PreAuthorize("hasAnyRole('MASTER','MANAGER','DEVELOPER','ACCOUNTANT')")
    public ApiResponse<ProductResponse> updatePrice(@PathVariable UUID id,
                                                    @Valid @RequestBody UpdatePriceRequest request) {
        return ApiResponse.ok(productService.updatePrice(id, request));
    }

    @PutMapping("/{id}/tags")
    @PreAuthorize("hasAnyRole('MASTER','MANAGER','DEVELOPER')")
    public ApiResponse<ProductResponse> replaceTags(@PathVariable UUID id,
                                                    @RequestBody Map<String, String> tags) {
        return ApiResponse.ok(productService.replaceTags(id, tags));
    }

    @PostMapping("/{id}/discontinue")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAnyRole('MASTER','MANAGER','DEVELOPER')")
    public void discontinue(@PathVariable UUID id) {
        productService.discontinue(id);
    }

    @PostMapping("/{id}/reactivate")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAnyRole('MASTER','MANAGER','DEVELOPER')")
    public void reactivate(@PathVariable UUID id) {
        productService.reactivate(id);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAnyRole('MASTER','MANAGER','DEVELOPER')")
    public void delete(@PathVariable UUID id,
                       @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        productService.delete(id, callerHeader);
    }
}
