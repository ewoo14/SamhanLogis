package com.samhanair.logis.accounting.web;

import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.accounting.service.TrialBalanceService;
import com.samhanair.logis.accounting.web.dto.TrialBalanceResponse;
import com.samhanair.logis.common.dto.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 시산표 endpoint (Plan §4).
 *
 * <p>권한: ACCOUNTANT / MASTER.
 * 잔액 부호 규약은 {@link TrialBalanceService} 참조.
 *
 * <p>SP-D2 동적 권한: {@code accounting.balances} 페이지 코드.
 */
@Slf4j
@RestController
@RequestMapping("/accounting/balances")
@RequiredArgsConstructor
public class TrialBalanceController {

    /** SP-D2 — 시산표 페이지 코드. */
    private static final String PAGE_CODE = "accounting.balances";
    private static final String ROLE_HEADER = "X-User-Role";

    private static final DateTimeFormatter PERIOD_FMT = DateTimeFormatter.ofPattern("yyyyMM");

    private final TrialBalanceService trialBalanceService;
    private final DynamicPermissionClient dynamicPermissionClient;

    /**
     * 회계 월 시산표 — period=yyyyMM (예: 202604).
     *
     * <p>SP-D2 동적 권한: VIEW 검증 (조회 전용 endpoint).
     *
     * @param period    회계 월 문자열 (yyyyMM)
     * @param roleHeader X-User-Role 헤더
     * @throws IllegalArgumentException period 파싱 실패 (400 매핑)
     */
    @Operation(summary = "시산표", description = "POSTED 분개 라인 집계 (yyyyMM)")
    @GetMapping
    @PreAuthorize("hasAnyRole('ACCOUNTANT','MASTER')")
    public ApiResponse<TrialBalanceResponse> byPeriod(
            @RequestParam String period,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        checkViewPermission(roleHeader);
        YearMonth ym;
        try {
            ym = YearMonth.parse(period, PERIOD_FMT);
        } catch (DateTimeParseException ex) {
            throw new IllegalArgumentException("period 는 yyyyMM 형식이어야 합니다 (예: 202604)");
        }
        return ApiResponse.ok(trialBalanceService.findByPeriod(ym));
    }

    /**
     * SP-D2 동적 VIEW 권한 검증 — 시산표 페이지.
     * canView=false → 점진 마이그레이션 정책으로 통과.
     */
    private void checkViewPermission(String actorRole) {
        if (actorRole == null || actorRole.isBlank()) {
            return;
        }
        boolean canView = dynamicPermissionClient.canView(actorRole, PAGE_CODE);
        if (!canView) {
            log.debug("[SP-D2] VIEW 동적 권한 false (fallback 또는 deny) — roleCode={} pageCode={}",
                    actorRole, PAGE_CODE);
        }
    }
}
