package com.samhanair.logis.product.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.product.domain.PriceHistory;
import com.samhanair.logis.product.repository.PriceHistoryRepository;
import com.samhanair.logis.product.repository.ProductEstimateExposureRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** #773 S1a — 일마감 단가 재검증용 시점별 정가 internal endpoint. */
@RestController
@RequestMapping("/products/internal/price-history")
@RequiredArgsConstructor
public class PriceHistoryInternalController {

    private final PriceHistoryRepository priceHistoryRepository;
    private final ProductRepository productRepository;
    private final ProductEstimateExposureRepository exposureRepository;

    /**
     * 제품/업무일 기준 적용 가능한 최신 정가를 조회한다.
     *
     * <p>service-local path 는 {@code /products/internal/price-history/applicable},
     * gateway prefix 적용 시 외부 관찰 경로는 {@code /api/v1/products/internal/price-history/applicable} 이다.
     *
     * <p>productId 가 존재하지 않거나 단종(soft-delete)된 Product 면 그 Product 의 price_history
     * row 가 남아있어도 404 를 반환한다({@code fixed-discount-rate} 단건 조회와 동일하게 Product
     * 활성 존재를 우선 확인) — 단종 품목은 재검증 대상에서 제외되어야 하기 때문이다.
     */
    @Operation(summary = "[내부] 시점별 적용 정가 단건 조회",
            description = "productId + asOf 기준 effectiveDate <= asOf 중 최신 price_history row 를 반환한다. "
                    + "productId 미존재/단종(soft-delete) 시에도 404.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401",
                    description = "X-Internal-Token 누락 또는 불일치"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404",
                    description = "productId 미존재/단종(soft-delete) 이거나 적용 가능한 시점별 정가 없음")
    })
    @GetMapping("/applicable")
    @Transactional(readOnly = true)
    public ApiResponse<ApplicablePriceResponse> applicable(
            @RequestParam("productId") UUID productId,
            @RequestParam("asOf") LocalDate asOf) {
        return ApiResponse.ok(findApplicable(productId, asOf));
    }

    /**
     * 제품 여러 건의 적용 정가를 한 번에 조회한다.
     *
     * <p>요청한 productId 중 적용 가능한 시점별 정가가 없는 건은 응답 Map 에서 생략된다(부분 성공).
     * 일마감 재검증(S2b)이 하루치 배치 중 일부 productId 가 결측이어도 있는 건만 재검증하고
     * 결측 건은 재검증 대상 외로 별도 리포트할 수 있도록 하기 위함이다. 단건 조회
     * {@link #applicable} 은 명시적 단건 조회이므로 결측 시 404 를 그대로 유지한다.
     *
     * <p>productId 가 존재하지 않거나 단종(soft-delete)된 Product 는 그 Product 의 price_history
     * row 존재 여부와 무관하게 생략 대상이다({@code fixed-discount-rate-bulk} 와 동일하게 Product
     * 활성 존재를 우선 확인) — 두 벌크 endpoint 가 단종 품목을 동일하게 취급해야 S2b 재검증
     * 정합이 유지된다.
     */
    @Operation(summary = "[내부] 시점별 적용 정가 벌크 조회",
            description = "body.productIds + body.asOf 기준 productId 별 최신 price_history row 를 반환한다. "
                    + "적용 가능한 정가가 없거나 productId 가 미존재/단종(soft-delete)인 건은 "
                    + "응답 Map 에서 생략된다(부분 성공).")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200",
                    description = "조회 성공(결측 productId 는 생략된 부분 Map 일 수 있음)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "요청 본문 오류"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401",
                    description = "X-Internal-Token 누락 또는 불일치")
    })
    @PostMapping("/applicable-bulk")
    @Transactional(readOnly = true)
    public ApiResponse<Map<UUID, ApplicablePriceResponse>> applicableBulk(
            @Valid @RequestBody ApplicablePriceBulkRequest request) {
        Map<UUID, ApplicablePriceResponse> out = new LinkedHashMap<>();
        for (UUID productId : request.productIds()) {
            findApplicableIfPresent(productId, request.asOf())
                    .ifPresent(response -> out.put(productId, response));
        }
        return ApiResponse.ok(out);
    }

    private ApplicablePriceResponse findApplicable(UUID productId, LocalDate asOf) {
        return findApplicableIfPresent(productId, asOf)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "시점별 정가를 찾을 수 없습니다"));
    }

    /**
     * 결측 시 예외 대신 빈 {@link Optional} 을 반환하는 조회. 단건 GET 은 {@link #findApplicable} 이
     * orElseThrow 로 404 를 던지고, bulk 조회는 이 메서드를 직접 사용해 결측 productId 를
     * 응답 Map 에서 생략(부분 성공)한다.
     *
     * <p>{@link PriceHistoryRepository#findApplicableLatest} 는 price_history 테이블만 조회하고
     * Product 존재/삭제 여부를 보지 않으므로, 단종(soft-delete) 후에도 price_history row 가 남아
     * 있으면 그대로 반환되는 문제가 있었다. {@code fixed-discount-rate}/{@code fixed-discount-rate-bulk}
     * 는 {@code ProductRepository.findById} 를 경유해 {@code @SQLRestriction(is_deleted = false)} 로
     * 단종 품목을 걸러내므로, 이 메서드도 price_history 조회 전에 동일하게 Product 활성 존재를
     * 먼저 확인해 두 internal endpoint 군의 단종 품목 취급을 대칭화한다.
     */
    private Optional<ApplicablePriceResponse> findApplicableIfPresent(UUID productId, LocalDate asOf) {
        if (productRepository.findById(productId).isEmpty()) {
            return Optional.empty();
        }
        return priceHistoryRepository.findApplicableLatest(productId, asOf)
                .map(history -> new ApplicablePriceResponse(
                        history.getReleasePrice(),
                        history.getDeliveryPrice(),
                        history.getEffectiveDate(),
                        exposureRepository.findByProductIdAndIsDeletedFalse(productId).stream()
                                .map(exposure -> exposure.getEstimateCategory().name())
                                .toList()));
    }

    public record ApplicablePriceResponse(
            BigDecimal release,
            BigDecimal delivery,
            LocalDate effectiveDate,
            List<String> estimateCategories) {
    }

    public record ApplicablePriceBulkRequest(
            @NotEmpty @Size(max = 500) List<@NotNull UUID> productIds,
            @NotNull LocalDate asOf) {
    }
}
