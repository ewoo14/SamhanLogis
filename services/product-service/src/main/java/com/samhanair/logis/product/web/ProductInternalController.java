package com.samhanair.logis.product.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.product.service.BundleExpander;
import com.samhanair.logis.product.service.EcountAliasResolveService;
import com.samhanair.logis.product.service.ProductService;
import com.samhanair.logis.product.web.dto.BundleIntegrityResponse;
import com.samhanair.logis.product.web.dto.EcountAliasResolveRequest;
import com.samhanair.logis.product.web.dto.EcountAliasResolveResponse;
import com.samhanair.logis.product.web.dto.ExpandRequest;
import com.samhanair.logis.product.web.dto.ExpandedLineResponse;
import com.samhanair.logis.product.web.dto.LookupByModelRequest;
import com.samhanair.logis.product.web.dto.LookupByLabelRequest;
import com.samhanair.logis.product.web.dto.LookupByModelCodesRequest;
import com.samhanair.logis.product.web.dto.LookupByCodeRequest;
import com.samhanair.logis.product.web.dto.LookupRequest;
import com.samhanair.logis.product.web.dto.ProductSummaryResponse;
import java.util.ArrayList;
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
    private final BundleExpander bundleExpander;
    private final EcountAliasResolveService ecountAliasResolveService;

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
     * 모델코드 일괄 조회 (internal) — partner-order 상세 productType enrich 경로.
     *
     * <p>direct PUT 주문 라인은 실제 product UUID 대신 synthetic stableProductId 를 저장할 수 있으므로,
     * productId 가 아니라 주문 라인 snapshot 의 modelCode 로 BUNDLE 여부를 조회한다.
     */
    @Operation(summary = "모델코드 일괄 조회 (internal)",
            description = "X-Internal-Token 인증 후 호출. partner-order 상세 productType enrich 전용.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "modelCodes 누락/공백"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "X-Internal-Token 누락 또는 불일치")
    })
    @PostMapping("/lookup-by-model-codes")
    public ApiResponse<List<ProductSummaryResponse>> lookupByModelCodes(
            @Valid @RequestBody LookupByModelCodesRequest request) {
        return ApiResponse.ok(productService.lookupByModelCodes(request.modelCodes()));
    }

    @Operation(summary = "Ecount alias batch resolve (internal)",
            description = "X-Internal-Token authenticated product_db owner lookup for MIG-8 order transform.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Resolved"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "X-Internal-Token missing or invalid")
    })
    @PostMapping("/resolve-ecount-aliases")
    public ApiResponse<EcountAliasResolveResponse> resolveEcountAliases(
            @Valid @RequestBody EcountAliasResolveRequest request) {
        return ApiResponse.ok(new EcountAliasResolveResponse(
                ecountAliasResolveService.resolve(request == null ? null : request.aliasCodes())));
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
     * 품목코드(product_code) 단건 조회 (internal) — inventory-service S3 출고 예약 경로.
     *
     * @param request LookupByCodeRequest (productCode: 정확 매칭 품목코드)
     * @return 응답 envelope 안 ProductSummaryResponse (200)
     */
    @Operation(summary = "품목코드 단건 조회 (internal)",
            description = "X-Internal-Token 인증 후 호출. inventory-service S3 인스턴스 출고 예약 serialManaged 확인용.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "productCode 누락/공백"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "X-Internal-Token 누락 또는 불일치"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "품목코드에 해당하는 제품이 없습니다")
    })
    @PostMapping("/lookup-by-code")
    public ApiResponse<ProductSummaryResponse> lookupByCode(@Valid @RequestBody LookupByCodeRequest request) {
        return ApiResponse.ok(productService.lookupSummaryByProductCode(request.productCode()));
    }

    /**
     * 회계 품목 라벨 단건 조회 (internal) — #773 일마감 재검증 라벨→productId 매핑 경로.
     */
    @Operation(summary = "회계 라벨 단건 조회 (internal)",
            description = "X-Internal-Token 인증. accounting 일마감 재검증(#773) 라벨→productId 매핑 전용. "
                    + "품목명[규격] 라벨에서 모델코드 토큰 추출 후 4단 fallback 매칭.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "라벨/토큰 추출 실패"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "토큰 불일치"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "미매칭"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "중복 매칭")
    })
    @PostMapping("/lookup-by-label")
    public ApiResponse<ProductSummaryResponse> lookupByLabel(@Valid @RequestBody LookupByLabelRequest request) {
        return ApiResponse.ok(productService.lookupSummaryByLabel(request.label()));
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

    /**
     * 세트 전개 (internal) — slip-service 견적/전표 생성 시 라인 품목을 구성품으로 전개.
     *
     * <p>BUNDLE EXPAND 면 옵션 선별 + 6:4 재배분된 구성품 라인 N개(첫 라인 setHead=true), KEEP/단일이면
     * 1 라인. legacy 종합견적서 explodeSetParts 정합. 단가는 setUnitOverride(화면 단가) base.
     */
    @Operation(summary = "세트 전개 (internal)",
            description = "X-Internal-Token 인증 후 호출. slip-service 견적/전표 라인 세트→구성품 전개 전용.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "전개 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "X-Internal-Token 누락 또는 불일치"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "parentModelCode 제품 없음")
    })
    @PostMapping("/expand")
    public ApiResponse<List<ExpandedLineResponse>> expand(@Valid @RequestBody ExpandRequest request) {
        ExpandRequest.Options o = request.options();
        BundleExpander.ExpandOptions opts = o == null ? BundleExpander.ExpandOptions.defaults()
                : new BundleExpander.ExpandOptions(o.remoteOption(), o.remoteExcluded(),
                o.panelOption(), o.panelShape360(), o.materialIncluded(), request.setUnitOverride());
        List<BundleExpander.ExpandedLine> lines =
                bundleExpander.expand(request.parentModelCode(), request.setQty(), opts);
        boolean expandedSet = lines.size() > 1;
        List<ExpandedLineResponse> result = new ArrayList<>(lines.size());
        for (int i = 0; i < lines.size(); i++) {
            BundleExpander.ExpandedLine l = lines.get(i);
            result.add(new ExpandedLineResponse(l.productId(), l.modelCode(), l.modelName(), l.name(),
                    l.quantity(), l.unitPrice(),
                    l.componentKind() == null ? null : l.componentKind().name(),
                    expandedSet && i == 0, l.specification()));
        }
        return ApiResponse.ok(result);
    }

    /**
     * 세트(BUNDLE) 구성품 정합 점검 (internal) — 운영 전/시트 sync 후 재실행.
     *
     * <p>모든 활성 BUNDLE 의 구성품이 활성 품목으로 해소되는지 점검. {@code healthy=false} 인 세트는
     * 견적/전표 전개 시 "세트 구성품 일부를 찾을 수 없습니다(미등록/단종)" 로 거부되므로, 운영 투입 전
     * issues 가 비어있어야 한다. X-Internal-Token 인증 통과 후 진입.
     *
     * @return 응답 envelope 안 {@link BundleIntegrityResponse} (200)
     */
    @Operation(summary = "세트 구성품 정합 점검 (internal)",
            description = "X-Internal-Token 인증 후 호출. BUNDLE 구성품↔활성 품목 해소 여부 점검(운영 전/sync 후).")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "점검 완료(healthy 여부 포함)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "X-Internal-Token 누락 또는 불일치")
    })
    @GetMapping("/bundle-integrity")
    public ApiResponse<BundleIntegrityResponse> bundleIntegrity() {
        return ApiResponse.ok(productService.checkBundleIntegrity());
    }
}
