package com.samhanair.logis.product.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.product.service.ProductService;
import com.samhanair.logis.product.web.dto.LookupByModelRequest;
import com.samhanair.logis.product.web.dto.LookupRequest;
import com.samhanair.logis.product.web.dto.ProductSummaryResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 서비스 간 internal endpoint. {@link com.samhanair.logis.security.InternalTokenFilter}
 * 가 X-Internal-Token 으로 인증하므로 별도 @PreAuthorize 불필요.
 */
@RestController
@RequestMapping("/products/internal")
@RequiredArgsConstructor
public class ProductInternalController {

    private final ProductService productService;

    /**
     * 제품 ID 일괄 조회 — inventory-service 등 internal 호출자가 productId 존재 여부 검증에 사용.
     * X-Internal-Token 헤더 인증 통과 후 진입.
     *
     * @param request LookupRequest (ids: 제품 UUID 리스트)
     * @return 응답 envelope 안 List&lt;ProductSummaryResponse&gt; (200) — 입력 순서와 무관
     */
    @Operation(summary = "제품 ID 일괄 조회 (internal)",
            description = "X-Internal-Token 인증 후 호출. inventory-service 등 service-to-service 용")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "X-Internal-Token 누락 또는 불일치")
    })
    @PostMapping("/lookup")
    public ApiResponse<List<ProductSummaryResponse>> lookup(@Valid @RequestBody LookupRequest request) {
        return ApiResponse.ok(productService.lookup(request.ids()));
    }

    /**
     * 모델명 단건 조회 (internal) — slip-service 의 ProductClient.lookupByModel 이 호출.
     * X-Internal-Token 인증 통과 후 진입. 정확 매칭만 수행 (대소문자 구분, 공백 trim).
     *
     * @param request LookupByModelRequest (modelName: 정확 매칭 모델명)
     * @return 응답 envelope 안 ProductSummaryResponse (200) — 단건
     *         ; 미존재 시 GlobalExceptionHandler 가 NOT_FOUND → 404 매핑
     */
    @Operation(summary = "모델명 단건 조회 (internal)",
            description = "X-Internal-Token 인증 후 호출. slip-service Slip 라인 modelName onBlur 흐름 전용. "
                    + "정확 매칭만 수행하며 미존재 시 404 NOT_FOUND.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "modelName 누락/공백"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "X-Internal-Token 누락 또는 불일치"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "모델명에 해당하는 제품이 없습니다")
    })
    @PostMapping("/lookup-by-model")
    public ApiResponse<ProductSummaryResponse> lookupByModel(@Valid @RequestBody LookupByModelRequest request) {
        return ApiResponse.ok(productService.lookupSummaryByModelName(request.modelName()));
    }

    /**
     * 제품명 단건 조회 (internal) — MIG-5 inventory-service 창고이동 raw 품목명 lookup 경로.
     */
    @Operation(summary = "제품명 단건 조회 (internal)",
            description = "X-Internal-Token 인증 후 호출. 이카운트 raw 품목명 정확 매칭 전용.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "name 누락/공백"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "X-Internal-Token 누락 또는 불일치"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "제품명에 해당하는 제품이 없습니다"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "제품명 중복 매칭")
    })
    @GetMapping("/by-name")
    public ApiResponse<ProductSummaryResponse> lookupByName(@RequestParam String name) {
        return ApiResponse.ok(productService.lookupSummaryByName(name));
    }
}
