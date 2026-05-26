package com.samhanair.logis.product.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.web.dto.ProductByCodeResponse;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 거래처 / QA 도구가 사용자 노출 식별자 (modelCode) 로 productId (UUID) 를 조회하는 endpoint.
 *
 * <p>경로 {@code GET /api/products/by-code/{code}} — qa-playwright 의
 * {@code lookupProductIdByCode} 헬퍼와 1:1 정합 (utils/api-clients.ts L121~).
 *
 * <p>{@link ProductRepository#findByModelCodeAndIsDeletedFalse(String)} 가 V3 마이그에서
 * 추가된 partial unique 컬럼이므로 단건 보장. soft-deleted 제품은 자동 제외
 * ({@link Product} 의 {@code @SQLRestriction("is_deleted = false")}).
 *
 * <p>본 응답은 {@link ProductByCodeResponse} (id + modelCode + name) 경량 record —
 * inventory-service 후속 호출용 productId 매핑이 단일 목적이므로 over-fetch 회피.
 */
@RestController
@RequestMapping("/api/products")
public class ProductByCodeController {

    private final ProductRepository productRepository;

    public ProductByCodeController(ProductRepository productRepository) {
        this.productRepository = productRepository;
    }

    @Operation(summary = "modelCode 로 제품 단건 조회 (productId 매핑)",
            description = "QA 헬퍼 lookupProductIdByCode + 거래처 클라이언트의 modelCode → productId 변환 endpoint. "
                    + "정확 매칭만 (대소문자 구분, soft-delete 제외). 응답은 id+modelCode+name 경량.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "인증/권한 없음"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "code 에 해당하는 제품이 없습니다")
    })
    @GetMapping("/by-code/{code}")
    @RequirePermission(page = "products.list", action = "VIEW")
    public ApiResponse<ProductByCodeResponse> findByCode(@PathVariable String code) {
        // Phase 7 종합 TM — generic NOT_FOUND 대신 PRODUCT_NOT_FOUND 도메인 specific 코드 사용.
        // HTTP 404 동일하지만 클라이언트/모니터링 필터에서 product 도메인 식별 가능.
        Product product = productRepository.findByModelCodeAndIsDeletedFalse(code)
                .orElseThrow(() -> new BusinessException(ErrorCode.PRODUCT_NOT_FOUND,
                        "code 에 해당하는 제품이 없습니다: " + code));
        return ApiResponse.ok(ProductByCodeResponse.from(product));
    }
}
