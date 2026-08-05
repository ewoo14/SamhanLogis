package com.samhanair.logis.slip.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.web.dto.SlipSummary;
import io.swagger.v3.oas.annotations.Operation;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 회계 전표 배분 원천 조회용 사용자-facing endpoint.
 *
 * <p>기존 {@code /internal/slips/by-period}는 서비스 간 호출 전용으로 유지한다.
 * 데스크톱 회계 화면은 게이트웨이의 {@code /slips/**} 사용자 라우트를 통과해야 하므로,
 * 이 controller는 동일한 조회 projection을 사용자 세션과 회계 목록 VIEW 권한으로 제공한다.
 */
@RestController
@RequestMapping("/slips")
@RequiredArgsConstructor
public class SlipAllocationSourceController {

    private final SlipRepository slipRepository;

    /** 매출전표 배분 source 조회 — accounting.sales-slip.list VIEW가 필요하다. */
    @Operation(summary = "매출전표 배분 원천 조회",
            description = "사용자 세션과 accounting.sales-slip.list VIEW 권한으로 기간별 출고전표 라인을 조회한다.")
    @RequirePermission(page = "accounting.sales-slip.list", action = PermissionAction.VIEW)
    @GetMapping(value = "/by-period", params = "type=OUTBOUND")
    public ApiResponse<List<SlipSummary>> findOutboundByPeriod(
            @RequestParam(name = "type") SlipType type,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) UUID partnerId) {
        return ApiResponse.ok(findByPeriod(type, from, to, partnerId));
    }

    /** 매입전표 배분 source 조회 — accounting.purchase-slip.list VIEW가 필요하다. */
    @Operation(summary = "매입전표 배분 원천 조회",
            description = "사용자 세션과 accounting.purchase-slip.list VIEW 권한으로 기간별 입고전표 라인을 조회한다.")
    @RequirePermission(page = "accounting.purchase-slip.list", action = PermissionAction.VIEW)
    @GetMapping(value = "/by-period", params = "type=INBOUND")
    public ApiResponse<List<SlipSummary>> findInboundByPeriod(
            @RequestParam(name = "type") SlipType type,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) UUID partnerId) {
        return ApiResponse.ok(findByPeriod(type, from, to, partnerId));
    }

    private List<SlipSummary> findByPeriod(SlipType type, LocalDate from, LocalDate to, UUID partnerId) {
        return slipRepository.findByPeriodWithLines(type, from, to, partnerId)
                .stream()
                .map(SlipSummary::of)
                .toList();
    }
}
