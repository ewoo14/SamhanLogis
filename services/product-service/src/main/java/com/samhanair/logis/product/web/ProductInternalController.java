package com.samhanair.logis.product.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.service.BundleExpander;
import com.samhanair.logis.product.service.EcountAliasResolveService;
import com.samhanair.logis.product.service.EcountAliasReservationService;
import com.samhanair.logis.product.service.ProductService;
import com.samhanair.logis.product.service.QuantitySyncRuleService;
import com.samhanair.logis.product.domain.QuantitySyncEstimateCategory;
import com.samhanair.logis.product.web.dto.QuantitySyncRuleResponse;
import com.samhanair.logis.product.web.dto.BundleIntegrityResponse;
import com.samhanair.logis.product.web.dto.EcountAliasResolveRequest;
import com.samhanair.logis.product.web.dto.EcountAliasResolveResponse;
import com.samhanair.logis.product.web.dto.EcountAliasReservationReleaseRequest;
import com.samhanair.logis.product.web.dto.ExpandRequest;
import com.samhanair.logis.product.web.dto.ExpandedLineResponse;
import com.samhanair.logis.product.web.dto.FixedDiscountResponse;
import com.samhanair.logis.product.web.dto.FixedDiscountRateBulkRequest;
import com.samhanair.logis.product.web.dto.LabelResolutionResult;
import com.samhanair.logis.product.web.dto.LookupByModelRequest;
import com.samhanair.logis.product.web.dto.LookupByLabelRequest;
import com.samhanair.logis.product.web.dto.LookupByLabelBulkRequest;
import com.samhanair.logis.product.web.dto.LookupByModelCodesRequest;
import com.samhanair.logis.product.web.dto.LookupByModelNamesRequest;
import com.samhanair.logis.product.web.dto.LookupByCodeRequest;
import com.samhanair.logis.product.web.dto.LookupRequest;
import com.samhanair.logis.product.web.dto.ProductSummaryResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;
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
public class ProductInternalController {

    private final ProductService productService;
    private final ProductRepository productRepository;
    private final BundleExpander bundleExpander;
    private final EcountAliasResolveService ecountAliasResolveService;
    private final EcountAliasReservationService ecountAliasReservationService;
    private final QuantitySyncRuleService quantitySyncRuleService;

    @Autowired
    public ProductInternalController(ProductService productService, ProductRepository productRepository,
                                     BundleExpander bundleExpander,
                                     EcountAliasResolveService ecountAliasResolveService,
                                     EcountAliasReservationService ecountAliasReservationService,
                                     QuantitySyncRuleService quantitySyncRuleService) {
        this.productService = productService;
        this.productRepository = productRepository;
        this.bundleExpander = bundleExpander;
        this.ecountAliasResolveService = ecountAliasResolveService;
        this.ecountAliasReservationService = ecountAliasReservationService;
        this.quantitySyncRuleService = quantitySyncRuleService;
    }

    /** 기존 standalone controller 단위 테스트와의 생성자 호환용. 운영 bean은 5-인 생성자를 사용한다. */
    public ProductInternalController(ProductService productService, ProductRepository productRepository,
                                     BundleExpander bundleExpander,
                                     EcountAliasResolveService ecountAliasResolveService) {
        this(productService, productRepository, bundleExpander, ecountAliasResolveService, null, null);
    }

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

    /**
     * 모델명 일괄 조회 (internal) — 전표 분석처럼 입력값이 모델명인 호출자 전용.
     * modelCode가 없는 이카운트 계보도 model_name으로 조회한다.
     */
    @Operation(summary = "모델명 일괄 조회 (internal)",
            description = "X-Internal-Token 인증 후 호출. 입력 모델명 기준 정확 매칭.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "modelNames 누락/공백"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "X-Internal-Token 누락 또는 불일치")
    })
    @PostMapping("/lookup-by-model-names")
    public ApiResponse<List<ProductSummaryResponse>> lookupByModelNames(
            @Valid @RequestBody LookupByModelNamesRequest request) {
        return ApiResponse.ok(productService.lookupByModelNames(request.modelNames()));
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
                ecountAliasResolveService.resolve(request == null ? null : request.aliasCodes(),
                        request == null ? null : request.reservationToken())));
    }

    @PostMapping("/release-ecount-alias-reservations")
    public ApiResponse<Void> releaseEcountAliasReservations(
            @Valid @RequestBody EcountAliasReservationReleaseRequest request) {
        ecountAliasReservationService.release(request.reservationToken());
        return ApiResponse.ok(null);
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
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "X-Internal-Token 누락 또는 불일치"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "라벨에 해당하는 제품이 없습니다"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "라벨 모델코드 중복 매칭")
    })
    @PostMapping("/lookup-by-label")
    public ApiResponse<ProductSummaryResponse> lookupByLabel(@Valid @RequestBody LookupByLabelRequest request) {
        return ApiResponse.ok(productService.lookupSummaryByLabel(request.label()));
    }

    /**
     * 회계 품목 라벨 벌크 조회 (internal) — #773 후속 슬라이스. accounting 일마감 재검증이 라벨 수만큼
     * 순차 호출(N+1)하던 것을 1회 호출로 대체하기 위한 배치 endpoint다.
     *
     * <p>단건 {@link #lookupByLabel} 과 완전히 동일한 3단 fallback 판정을 라벨마다 적용하되, 미매칭/
     * 다의성/토큰추출실패를 404/409 예외 대신 {@link LabelResolutionResult#status()} 로 보존한
     * 부분 성공(partial success) 응답을 200 으로 반환한다 — 기존 {@code applicable-bulk}/
     * {@code fixed-discount-rate-bulk} 와 동일 계약 스타일이다.
     */
    @Operation(summary = "회계 라벨 벌크 조회 (internal)",
            description = "X-Internal-Token 인증. accounting 일마감 재검증(#773 후속) 라벨→productId N+1 제거 전용. "
                    + "요청 labels 전부가 응답 Map 키로 포함되며, 라벨별 상태는 MATCHED/NOT_FOUND/AMBIGUOUS 로 보존된다 "
                    + "(단건과 달리 부분 성공 — 미매칭/다의성이어도 200).")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200",
                    description = "조회 완료(라벨별 상태는 응답 body 의 status 로 판정)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "labels 누락/상한 초과"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "X-Internal-Token 누락 또는 불일치")
    })
    @PostMapping("/lookup-by-label-bulk")
    public ApiResponse<Map<String, LabelResolutionResult>> lookupByLabelBulk(
            @Valid @RequestBody LookupByLabelBulkRequest request) {
        return ApiResponse.ok(productService.lookupSummaryByLabelBulk(request.labels()));
    }

    /**
     * 고정DC율 단건 조회 (internal) — #773 일마감 재검증의 productId → fixedDiscountRate 참조 경로.
     *
     * <p>반환값은 {@link Product#getFixedDiscountRate()} 의 percent(예: 45.00) 그대로다. 레거시
     * Code.js 의 {@code fixedDc}(분수 0.45)에 {@code * 100} 을 적용한 현대 저장값이므로,
     * S2 재검증이 {@code expectRate=round(fixedDc*100)} 와 비교할 때 이 값은 이미
     * expectRate 공간이다. 재차 {@code * 100} 하면 안 된다.
     */
    @Operation(summary = "고정DC율 단건 조회 (internal)",
            description = "X-Internal-Token 인증. #773 일마감 재검증 productId→fixedDiscountRate 조회 전용. "
                    + "응답 fixedDiscountRate 는 percent(45.00) 공간이며 null 은 고정DC 미설정 정상 상태.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "X-Internal-Token 누락 또는 불일치"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "고정DC율 조회 대상 품목을 찾을 수 없습니다")
    })
    @GetMapping("/fixed-discount-rate")
    @Transactional(readOnly = true)
    public ApiResponse<FixedDiscountResponse> fixedDiscountRate(@RequestParam("productId") UUID productId) {
        return ApiResponse.ok(findFixedDiscountRate(productId));
    }

    /**
     * 고정DC율 벌크 조회 (internal) — #773 일마감 재검증의 productId 목록 참조 경로.
     *
     * <p>입력 productIds 순서를 {@link LinkedHashMap} 으로 보존한다. productId 자체가 존재하지
     * 않는 건은 응답 Map 에서 생략된다(부분 성공) — 일마감 재검증(S2b)이 하루치 배치 중 결측
     * productId 가 섞여도 있는 건만 재검증하고 결측 건은 재검증 대상 외로 별도 리포트할 수
     * 있도록 하기 위함이다. {@code fixedDiscountRate == null} 은 제품은 존재하되 고정DC
     * 미설정이라는 유효 상태이므로 생략 대상이 아니라 {@link FixedDiscountResponse} 에 null 값
     * 그대로 담아 Map 에 포함한다. 단건 조회 {@link #fixedDiscountRate} 는 명시적 단건 조회이므로
     * productId 미존재 시 404 를 그대로 유지한다.
     */
    @Operation(summary = "고정DC율 벌크 조회 (internal)",
            description = "X-Internal-Token 인증. body.productIds 기준 fixedDiscountRate 를 Map 으로 반환한다. "
                    + "응답 fixedDiscountRate 는 percent(45.00) 공간이며 null 은 고정DC 미설정 정상 상태. "
                    + "productId 자체가 존재하지 않는 건은 응답 Map 에서 생략된다(부분 성공).")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200",
                    description = "조회 성공(존재하지 않는 productId 는 생략된 부분 Map 일 수 있음)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "요청 본문 오류"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "X-Internal-Token 누락 또는 불일치")
    })
    @PostMapping("/fixed-discount-rate-bulk")
    @Transactional(readOnly = true)
    public ApiResponse<Map<UUID, FixedDiscountResponse>> fixedDiscountRateBulk(
            @Valid @RequestBody FixedDiscountRateBulkRequest request) {
        Map<UUID, FixedDiscountResponse> out = new LinkedHashMap<>();
        for (UUID productId : request.productIds()) {
            productRepository.findById(productId)
                    .ifPresent(product -> out.put(productId, new FixedDiscountResponse(product.getFixedDiscountRate())));
        }
        return ApiResponse.ok(out);
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
        BundleExpander.ExpandOptions defaults = BundleExpander.ExpandOptions.defaults();
        BundleExpander.ExpandOptions opts = o == null
                ? new BundleExpander.ExpandOptions(defaults.remoteOption(), defaults.remoteExcluded(),
                defaults.panelOption(), defaults.panelShape360(), defaults.materialIncluded(),
                request.setUnitOverride())
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

    /** 종합견적서의 서버 규칙 기반 수량 동기화용 internal read endpoint. */
    @GetMapping("/quantity-sync-rules")
    public ApiResponse<List<QuantitySyncRuleResponse>> quantitySyncRules() {
        if (quantitySyncRuleService == null) return ApiResponse.ok(List.of());
        return ApiResponse.ok(quantitySyncRuleService.list(QuantitySyncEstimateCategory.HOME_MULTI));
    }

    private FixedDiscountResponse findFixedDiscountRate(UUID productId) {
        Product product = productRepository.findById(productId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "고정DC율 조회 대상 품목을 찾을 수 없습니다"));
        return new FixedDiscountResponse(product.getFixedDiscountRate());
    }
}
