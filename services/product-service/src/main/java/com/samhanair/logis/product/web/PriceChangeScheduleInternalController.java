package com.samhanair.logis.product.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.product.domain.PriceChangeSchedule;
import com.samhanair.logis.product.repository.PriceChangeScheduleRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 단가변동 설정을 내부 클라이언트(order-app/estimate-app)에 제공하는 endpoint. */
@RestController
@RequestMapping("/products/internal")
@RequiredArgsConstructor
public class PriceChangeScheduleInternalController {

    private final PriceChangeScheduleRepository priceChangeScheduleRepository;

    /**
     * 카테고리별 단가변동 적용일을 조회한다.
     *
     * <p>응답 key 는 order-app {@code PartnerOrderLine.categoryKey} 와 동일한
     * {@code homemulti/singleSets/commercialMulti/oldProducts} 이며, value 는
     * KST 업무일 기준 적용 시작일이다.
     *
     * <p><b>#688 계약 고정</b>: 경로/응답 shape(category → effectiveDate 맵)는 order-app 이
     * 소비 중이므로 S4a({@link #getDefaultVariant()} 추가)에서도 변경하지 않는다.
     *
     * @return ApiResponse 로 래핑된 categoryKey → effectiveDate 맵
     */
    @Operation(summary = "[내부] 단가변동 카테고리별 적용일 조회",
            description = "order-app categoryKey 4종을 key 로 하는 KST 업무일 기준 변동일 맵을 반환한다.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401",
                    description = "X-Internal-Token 누락 또는 불일치")
    })
    @GetMapping("/price-change-schedule")
    @Transactional(readOnly = true)
    public ApiResponse<Map<String, LocalDate>> getSchedule() {
        Map<String, PriceChangeSchedule> byCategory = priceChangeScheduleRepository
                .findAllByOrderByCategoryAsc()
                .stream()
                .collect(Collectors.toMap(
                        PriceChangeSchedule::getCategory,
                        Function.identity(),
                        (a, b) -> a));

        Map<String, LocalDate> out = new LinkedHashMap<>();
        for (String category : PriceChangeSchedule.CATEGORY_KEYS) {
            PriceChangeSchedule schedule = byCategory.get(category);
            if (schedule != null) {
                out.put(category, schedule.getEffectiveDate());
            }
        }
        return ApiResponse.ok(out);
    }

    /**
     * 카테고리별 변동단가 체크박스 기본값을 조회한다 (S4a, #17).
     *
     * <p>응답 key 는 {@link #getSchedule()} 와 동일한 order-app categoryKey 4종이며, value 는
     * estimate-app 견적 작성 화면의 변동단가 체크박스 초기 상태다.
     *
     * @return ApiResponse 로 래핑된 categoryKey → defaultPreChange 맵
     */
    @Operation(summary = "[내부] 단가변동 카테고리별 변동단가 기본값 조회",
            description = "order-app categoryKey 4종을 key 로 하는 변동단가 체크박스 기본값 맵을 반환한다.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401",
                    description = "X-Internal-Token 누락 또는 불일치")
    })
    @GetMapping("/price-change-default-variant")
    @Transactional(readOnly = true)
    public ApiResponse<Map<String, Boolean>> getDefaultVariant() {
        Map<String, PriceChangeSchedule> byCategory = priceChangeScheduleRepository
                .findAllByOrderByCategoryAsc()
                .stream()
                .collect(Collectors.toMap(
                        PriceChangeSchedule::getCategory,
                        Function.identity(),
                        (a, b) -> a));

        Map<String, Boolean> out = new LinkedHashMap<>();
        for (String category : PriceChangeSchedule.CATEGORY_KEYS) {
            PriceChangeSchedule schedule = byCategory.get(category);
            if (schedule != null) {
                out.put(category, schedule.getDefaultPreChange());
            }
        }
        return ApiResponse.ok(out);
    }
}
