package com.samhanair.logis.product.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.product.domain.PriceHistory;
import com.samhanair.logis.product.repository.PriceHistoryRepository;
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

    /**
     * 제품/업무일 기준 적용 가능한 최신 정가를 조회한다.
     *
     * <p>service-local path 는 {@code /products/internal/price-history/applicable},
     * gateway prefix 적용 시 외부 관찰 경로는 {@code /api/v1/products/internal/price-history/applicable} 이다.
     */
    @Operation(summary = "[내부] 시점별 적용 정가 단건 조회",
            description = "productId + asOf 기준 effectiveDate <= asOf 중 최신 price_history row 를 반환한다.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401",
                    description = "X-Internal-Token 누락 또는 불일치"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404",
                    description = "적용 가능한 시점별 정가 없음")
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
     */
    @Operation(summary = "[내부] 시점별 적용 정가 벌크 조회",
            description = "body.productIds + body.asOf 기준 productId 별 최신 price_history row 를 반환한다. "
                    + "적용 가능한 정가가 없는 productId 는 응답 Map 에서 생략된다(부분 성공).")
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
     */
    private Optional<ApplicablePriceResponse> findApplicableIfPresent(UUID productId, LocalDate asOf) {
        return priceHistoryRepository.findApplicableLatest(productId, asOf)
                .map(history -> new ApplicablePriceResponse(
                        history.getReleasePrice(),
                        history.getDeliveryPrice(),
                        history.getEffectiveDate()));
    }

    public record ApplicablePriceResponse(
            BigDecimal release,
            BigDecimal delivery,
            LocalDate effectiveDate) {
    }

    public record ApplicablePriceBulkRequest(
            @NotEmpty @Size(max = 500) List<@NotNull UUID> productIds,
            @NotNull LocalDate asOf) {
    }
}
