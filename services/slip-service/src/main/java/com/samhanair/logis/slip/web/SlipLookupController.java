package com.samhanair.logis.slip.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ExpandedLineDto;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.web.dto.ExpandSlipLineRequest;
import com.samhanair.logis.slip.web.dto.ExpandedSlipLineResponse;
import jakarta.validation.Valid;
import java.util.List;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Slip 라인 입력 보조 endpoint — facade 역할로 product-service 의 internal lookup 을 감싼다.
 *
 * <p>FE 가 slip-service 한 곳만 호출하면 되도록 하기 위한 wrapper. 권한 매트릭스는 SlipController
 * 의 작성/조회 권한과 동일 (SALES/MANAGER/MASTER + 창고원/재고원/회계원).
 *
 * <p>개발책임자 결정 사항 Q3=B (modelName onBlur lookup 흐름) 에 따라 본 슬라이스에서 신설.
 */
@RestController
@RequestMapping("/slips")
@RequiredArgsConstructor
public class SlipLookupController {

    private final ProductClient productClient;

    /**
     * 모델명으로 제품 단건 조회 (facade) — Slip 라인 입력 시 modelName onBlur 자동 채움용.
     * 내부적으로 {@link ProductClient#lookupByModel(String)} 으로 product-service 의
     * {@code POST /products/internal/lookup-by-model} 을 호출.
     *
     * @param modelName 정확 매칭할 제품 모델명 (URL query param, 공백 trim 적용)
     * @return 200, ProductSummary (id/name/modelName/categoryId/sellingPrice/status)
     *         ; 미존재 시 404 NOT_FOUND
     */
    @Operation(summary = "모델명으로 제품 단건 조회 (facade)",
            description = "Slip 라인 입력 시 modelName onBlur 자동 채움. product-service 호출 위임")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "modelName 누락/공백"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "인증/권한 없음"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "모델명에 해당하는 제품이 없습니다")
    })
    @GetMapping("/lookup-product")
    @RequirePermission(page = "slip.lookup-product", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<ProductSummary> lookupProduct(@RequestParam String modelName) {
        return ApiResponse.ok(productClient.lookupByModel(modelName));
    }

    /** 저장 시 {@code SlipService.addSlipLinesExpanded}와 동일한 엔진으로 화면 행을 전개한다. */
    @PostMapping("/expand-line")
    @RequirePermission(page = "slip.lookup-product", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<List<ExpandedSlipLineResponse>> expandLine(
            @Valid @org.springframework.web.bind.annotation.RequestBody ExpandSlipLineRequest request) {
        ExpandedLineDto.Options options = request.setOptions() == null ? null : new ExpandedLineDto.Options(
                request.setOptions().remoteOption(), Boolean.TRUE.equals(request.setOptions().remoteExcluded()),
                request.setOptions().panelOption(), request.setOptions().panelShape360(),
                Boolean.TRUE.equals(request.setOptions().materialIncluded()));
        List<ExpandedLineDto> expanded = productClient.expand(
                request.parentModelCode(), java.math.BigDecimal.valueOf(request.quantity()), options, request.unitPrice());
        return ApiResponse.ok(expanded.stream().map(line -> new ExpandedSlipLineResponse(
                line.productId(), line.modelCode(), line.modelName(), line.name(), line.quantity(), line.unitPrice(),
                line.componentKind(), line.setHead(), line.specification()
        )).toList());
    }
}
