package com.samhanair.logis.accounting.web;

import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.accounting.domain.PeriodType;
import com.samhanair.logis.accounting.service.MonthEndCloseService;
import com.samhanair.logis.accounting.web.dto.AccountingPeriodResponse;
import com.samhanair.logis.accounting.web.dto.CreateClosingRequest;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 매출 마감 endpoint (Phase 10 Step 8 — P2-4).
 *
 * <p>매뉴얼 출처: {@code docs/manual/02-창고/04-매출-마감.md}.
 *
 * <p>권한 매트릭스 (매뉴얼 §4):
 *
 * <ul>
 *   <li>POST /accounting/closings           — ACCOUNTANT, MASTER (일별/월별 마감 실행)</li>
 *   <li>GET  /accounting/closings           — ACCOUNTANT, MANAGER, MASTER (목록 조회)</li>
 *   <li>POST /accounting/closings/{id}/reverse — MASTER 만 (역마감)</li>
 * </ul>
 *
 * <p>마감 실행 시 slip-service.lock-by-period 호출 → CONFIRMED 슬립 일괄 LOCKED.
 * 마감 후 해당 기간 분개/세금계산서 입력은 {@code AccountingPeriodGuard} 가 차단.
 *
 * <p>SP-D2 동적 권한: {@code accounting.period-close} 페이지 코드.
 */
@Slf4j
@RestController
@RequestMapping("/accounting/closings")
@RequiredArgsConstructor
public class MonthEndCloseController {

    /** SP-D2 — 월말 마감 페이지 코드. */
    private static final String PAGE_CODE = "accounting.period-close";

    private static final String CALLER_HEADER = "X-User-Id";
    private static final String ROLE_HEADER = "X-User-Role";

    private final MonthEndCloseService monthEndCloseService;
    private final DynamicPermissionClient dynamicPermissionClient;

    /** 마감 실행 — DAILY 또는 MONTHLY. slip-service 호출 + 합계 stamp. */
    @Operation(summary = "매출 마감 실행",
            description = "DAILY/MONTHLY 마감. slip-service.lock-by-period 호출 + 매출/매입/판관비 합계 stamp")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "마감 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "이미 마감된 기간 또는 slip-service 4xx")
    })
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = PAGE_CODE, action = "EDIT")
    public ApiResponse<AccountingPeriodResponse> close(
            @Valid @RequestBody CreateClosingRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        checkEditPermission(roleHeader);
        return ApiResponse.ok(monthEndCloseService.close(request, callerOrSystem(callerHeader)));
    }

    /** 목록 조회 — period_type / year 필터. */
    @Operation(summary = "마감 목록 조회", description = "period_type / year 필터. MANAGER 는 조회 전용")
    @GetMapping
    @RequirePermission(page = PAGE_CODE, action = "VIEW")
    public ApiResponse<List<AccountingPeriodResponse>> list(
            @RequestParam(required = false) PeriodType periodType,
            @RequestParam(required = false) Integer year) {
        return ApiResponse.ok(monthEndCloseService.list(periodType, year));
    }

    /** 역마감 — MASTER 만. */
    @Operation(summary = "역마감", description = "CLOSED → OPEN. MASTER 만 가능")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "역마감 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "MASTER 가 아닐 때"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "미존재"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "CLOSED 가 아닐 때")
    })
    @PostMapping("/{id}/reverse")
    @RequirePermission(page = "accounting.period-close.reverse", action = "EDIT")
    public ApiResponse<AccountingPeriodResponse> reverse(
            @PathVariable UUID id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        checkEditPermission(roleHeader);
        return ApiResponse.ok(monthEndCloseService.reverse(id, callerOrSystem(callerHeader)));
    }

    private String callerOrSystem(String header) {
        return (header == null || header.isBlank()) ? "system" : header;
    }

    // =========================================================================
    // SP-D2 동적 권한 헬퍼
    // =========================================================================

    /**
     * SP-D2 동적 EDIT 권한 검증 — 월말 마감 페이지 코드.
     *
     * @param actorRole 요청자 role
     */
    private void checkEditPermission(String actorRole) {
        if (actorRole == null || actorRole.isBlank()) {
            return;
        }
        boolean canEdit = dynamicPermissionClient.canEdit(actorRole, PAGE_CODE);
        if (!canEdit) {
            boolean canView = dynamicPermissionClient.canView(actorRole, PAGE_CODE);
            if (canView) {
                log.warn("[SP-D2] 동적 권한 차단 (view-only override) — roleCode={} pageCode={}", actorRole, PAGE_CODE);
                throw new BusinessException(ErrorCode.FORBIDDEN,
                        "동적 권한 설정에 의해 마감 편집 권한이 차단되었습니다.");
            }
            log.debug("[SP-D2] 동적 권한 override 없음 (fallback) — roleCode={} pageCode={}", actorRole, PAGE_CODE);
        }
    }
}
