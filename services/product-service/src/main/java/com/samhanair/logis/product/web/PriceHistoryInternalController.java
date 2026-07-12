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
     * <p>요청한 productId 중 하나라도 적용 row 가 없으면 부분 응답 대신 404 를 반환한다. 일마감
     * 재검증은 누락된 기준 단가를 조용히 통과시키면 금액 무결성이 깨지기 때문이다.
     */
    @Operation(summary = "[내부] 시점별 적용 정가 벌크 조회",
            description = "body.productIds + body.asOf 기준 productId 별 최신 price_history row 를 반환한다.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "요청 본문 오류"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401",
                    description = "X-Internal-Token 누락 또는 불일치"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404",
                    description = "적용 가능한 시점별 정가 없음")
    })
    @PostMapping("/applicable-bulk")
    @Transactional(readOnly = true)
    public ApiResponse<Map<UUID, ApplicablePriceResponse>> applicableBulk(
            @Valid @RequestBody ApplicablePriceBulkRequest request) {
        Map<UUID, ApplicablePriceResponse> out = new LinkedHashMap<>();
        for (UUID productId : request.productIds()) {
            out.put(productId, findApplicable(productId, request.asOf()));
        }
        return ApiResponse.ok(out);
    }

    private ApplicablePriceResponse findApplicable(UUID productId, LocalDate asOf) {
        PriceHistory history = priceHistoryRepository.findApplicableLatest(productId, asOf)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "시점별 정가를 찾을 수 없습니다"));
        return new ApplicablePriceResponse(
                history.getReleasePrice(),
                history.getDeliveryPrice(),
                history.getEffectiveDate());
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
