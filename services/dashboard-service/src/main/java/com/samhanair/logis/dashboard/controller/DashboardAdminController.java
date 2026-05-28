package com.samhanair.logis.dashboard.controller;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.dashboard.domain.AggregateInterval;
import com.samhanair.logis.dashboard.domain.KpiCategory;
import com.samhanair.logis.dashboard.dto.RealTimeStockResponse;
import com.samhanair.logis.dashboard.dto.SalesAggregateResponse;
import com.samhanair.logis.dashboard.dto.KpiSnapshotResponse;
import com.samhanair.logis.dashboard.service.KpiService;
import com.samhanair.logis.dashboard.service.MaterializedViewRefreshService;
import com.samhanair.logis.dashboard.service.PartnerCodeResolver;
import com.samhanair.logis.dashboard.service.RealTimeStockService;
import com.samhanair.logis.dashboard.service.SalesAggregateService;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.security.permission.PermissionAction;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 대시보드 admin endpoint — KPI 조회 / 실시간 재고 / 매출 집계 / materialized view refresh.
 *
 * <p>인증 = X-User-* 헤더 + {@code @RequirePermission} 동적 권한 가드.
 *
 * <p>UUID 비공개 가드 — 모든 응답은 사용자 노출 식별자 (warehouseCode / partnerCode) 기준.
 */
@RestController
@RequestMapping("/admin/dashboard")
@RequiredArgsConstructor
public class DashboardAdminController {

    private final KpiService kpiService;
    private final RealTimeStockService realTimeStockService;
    private final SalesAggregateService salesAggregateService;
    private final MaterializedViewRefreshService refreshService;
    private final PartnerCodeResolver partnerCodeResolver;

    /**
     * KPI 조회 (filter — category 선택). category null 인 경우 전체 카테고리 시계열 반환.
     */
    @Operation(summary = "KPI 조회 (Admin)")
    @GetMapping("/kpi")
    @RequirePermission(page = "dashboard.admin", action = PermissionAction.VIEW)
    public ApiResponse<List<KpiSnapshotResponse>> listKpi(
            @RequestParam(required = false) KpiCategory category,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        if (category != null) {
            return ApiResponse.ok(kpiService.findByCategoryAndDateRange(category, from, to).stream()
                    .map(KpiSnapshotResponse::from)
                    .toList());
        }
        return ApiResponse.ok(kpiService.findByDateRange(from, to).stream()
                .map(KpiSnapshotResponse::from)
                .toList());
    }

    /**
     * 실시간 재고 조회 — warehouseCode + (선택) productCode 필터.
     *
     * <p>UUID 비공개 가드 — productCode 는 호출자가 부여 (skeleton 단계 — productId 직접 입력 시 빈 결과,
     * 실 prod 환경에서는 warehouseCode 만으로 admin 화면 노출).
     */
    @Operation(summary = "실시간 재고 조회 (Admin)")
    @GetMapping("/realtime-stock")
    @RequirePermission(page = "dashboard.admin", action = PermissionAction.VIEW)
    public ApiResponse<List<RealTimeStockResponse>> realtimeStock(
            @RequestParam(required = false) String warehouseCode,
            @RequestParam(required = false) String productCode) {
        // skeleton 단계 — productCode 는 응답에만 첨부 (lookup 미수행). Phase 10 시점 product-service 통합.
        return ApiResponse.ok(realTimeStockService.findStocks(warehouseCode, null).stream()
                .map(s -> RealTimeStockResponse.from(s, productCode != null ? productCode : "(미매핑)"))
                .toList());
    }

    /**
     * 매출 집계 조회 — 기간 + interval (DAILY/WEEKLY/MONTHLY) + (선택) partnerCode.
     *
     * <p>PR #94 W4 후속 fix (QA Q-W4-2 채택) — UUID 비공개 가드 일관. 입력 파라미터에서
     * partnerId UUID 를 제거하고 partnerCode (사용자 노출 식별자) 만 받음. service 가
     * {@link PartnerCodeResolver} 로 내부 UUID 변환. partnerCode 가 미존재인 경우 400 응답.
     *
     * <p>backward-compat — partnerCode 미지정 시 전체 거래처 합계 (이전 동작 보존).
     */
    @Operation(summary = "매출 집계 조회 (Admin)")
    @GetMapping("/sales-aggregate")
    @RequirePermission(page = "dashboard.admin", action = PermissionAction.VIEW)
    public ApiResponse<List<SalesAggregateResponse>> salesAggregate(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false, defaultValue = "DAILY") AggregateInterval interval,
            @RequestParam(required = false) String partnerCode) {
        UUID partnerId = null;
        if (partnerCode != null && !partnerCode.isBlank()) {
            partnerId = partnerCodeResolver.resolve(partnerCode)
                    .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_INPUT,
                            "거래처 코드 미존재 또는 미해소 (skeleton-mode 환경 포함): " + partnerCode));
        }
        String displayCode = partnerCode != null && !partnerCode.isBlank() ? partnerCode : "(미매핑)";
        return ApiResponse.ok(salesAggregateService.findAggregates(from, to, interval, partnerId).stream()
                .map(s -> SalesAggregateResponse.from(s, displayCode))
                .toList());
    }

    /**
     * Materialized view REFRESH 트리거 — admin only (별도 scheduled job 보유, 본 endpoint 는 수동 트리거).
     */
    @Operation(summary = "Materialized view REFRESH (Admin)")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "REFRESH 결과 (각 view 별 성공 여부)")
    })
    @PostMapping("/refresh")
    @RequirePermission(page = "dashboard.admin", action = PermissionAction.UPDATE)
    public ApiResponse<MaterializedViewRefreshService.RefreshResult> refresh() {
        kpiService.invalidateCache();
        return ApiResponse.ok(refreshService.refreshAll());
    }

}
