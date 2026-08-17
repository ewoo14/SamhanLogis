package com.samhanair.logis.product.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.product.domain.PriceChangeSchedule;
import com.samhanair.logis.product.repository.PriceChangeScheduleRepository;
import com.samhanair.logis.product.web.dto.PriceChangeScheduleAdminResponse;
import com.samhanair.logis.product.web.dto.PriceChangeScheduleUpdateRequest;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.persistence.EntityNotFoundException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 단가변동 스케줄 admin 조회/수정 endpoint (S4a, #17 단가변동 관리 — dev-lead-confirmed Q5/Q7).
 *
 * <p>기존 {@link PriceChangeScheduleInternalController}({@code /products/internal/price-change-schedule},
 * order-app/estimate-app 내부 client 전용 read-only)와 별개로, 본 컨트롤러는 admin 화면이 카테고리 4종의
 * 적용일 + 변동단가 체크박스 기본값을 조회/수정하는 write 경로다.
 *
 * <p><b>게이트웨이</b>: 기존 {@code product-admin-v1} 라우트({@code Path=/api/v1/products/admin/**},
 * no-strip)가 이미 이 경로를 커버하므로 신규 게이트웨이 라우트를 추가하지 않는다.
 *
 * <p><b>권한</b>: {@code products.price-schedule} page-code — GET 은 VIEW, PUT 은 UPDATE.
 * MANAGER + ACCOUNTANT 양쪽 빌트인 그룹에 부여(dev-lead-confirmed 리뷰 fix, V86).
 */
@RestController
@RequestMapping("/api/v1/products/admin/price-change-schedule")
@RequiredArgsConstructor
public class PriceChangeScheduleAdminController {

    private final PriceChangeScheduleRepository priceChangeScheduleRepository;

    /**
     * 카테고리 4종의 단가변동 스케줄을 {@link PriceChangeSchedule#CATEGORY_KEYS} 순서로 조회한다.
     *
     * @return ApiResponse 로 래핑된 카테고리별 스케줄 목록 (최대 4건)
     */
    @Operation(summary = "단가변동 스케줄 admin 목록 조회",
            description = "order-app categoryKey 4종의 적용일 + 변동단가 체크박스 기본값을 조회한다.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "권한 없음")
    })
    @GetMapping
    @RequirePermission(page = "products.price-schedule", action = PermissionAction.VIEW)
    @Transactional(readOnly = true)
    public ApiResponse<List<PriceChangeScheduleAdminResponse>> list() {
        Map<String, PriceChangeSchedule> byCategory = priceChangeScheduleRepository
                .findAllByOrderByCategoryAsc()
                .stream()
                .collect(Collectors.toMap(
                        PriceChangeSchedule::getCategory,
                        Function.identity(),
                        (a, b) -> a));

        List<PriceChangeScheduleAdminResponse> out = new ArrayList<>();
        for (String category : PriceChangeSchedule.CATEGORY_KEYS) {
            PriceChangeSchedule schedule = byCategory.get(category);
            if (schedule != null) {
                out.add(PriceChangeScheduleAdminResponse.from(schedule));
            }
        }
        return ApiResponse.ok(out);
    }

    /**
     * 카테고리 1건의 적용일 / 변동단가 기본값을 부분 수정한다.
     *
     * <p>{@code effectiveDate}/{@code defaultPreChange} 는 각각 선택이며, 요청 본문에서
     * 생략(null)된 필드는 기존 값을 유지한다 (null-keep partial update,
     * {@link PriceChangeSchedule#update}).
     *
     * @param category order-app categoryKey 4종 중 하나 (경로 변수)
     * @param request 부분 수정 요청 본문
     * @return ApiResponse 로 래핑된 수정 후 스케줄
     */
    @Operation(summary = "단가변동 스케줄 admin 부분 수정",
            description = "지정 카테고리의 적용일 / 변동단가 기본값을 null-keep 방식으로 부분 수정한다.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "수정 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "존재하지 않는 카테고리"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "권한 없음")
    })
    @PutMapping("/{category}")
    @RequirePermission(page = "products.price-schedule", action = PermissionAction.UPDATE)
    @Transactional
    public ApiResponse<PriceChangeScheduleAdminResponse> update(
            @PathVariable String category,
            @RequestBody PriceChangeScheduleUpdateRequest request) {
        PriceChangeSchedule schedule = priceChangeScheduleRepository.findByCategory(category)
                .orElseThrow(() -> new EntityNotFoundException("존재하지 않는 단가변동 카테고리: " + category));
        schedule.update(request.effectiveDate(), request.defaultPreChange());
        return ApiResponse.ok(PriceChangeScheduleAdminResponse.from(schedule));
    }
}
