package com.samhanair.logis.accounting.web;

import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.accounting.domain.DailyClosingKind;
import com.samhanair.logis.accounting.domain.DailyClosingSourceKind;
import com.samhanair.logis.accounting.service.DailyClosingService;
import com.samhanair.logis.accounting.web.dto.CreateDailyClosingRequest;
import com.samhanair.logis.accounting.web.dto.DailyClosingResponse;
import com.samhanair.logis.common.dto.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 일마감 endpoint (SP-08-6-5).
 *
 * <p>legacy GAS 12번 "일마감 프로그램" — 특정 날짜의 세금계산서(ISSUED) 집계 + 잠금.
 *
 * <p>권한 매트릭스:
 * <ul>
 *   <li>POST  /api/v1/accounting/daily-closings — {@code @RequirePermission(accounting.daily-closing.run, CREATE)}</li>
 *   <li>GET   /api/v1/accounting/daily-closings — {@code @RequirePermission(accounting.daily-closing, VIEW)}</li>
 *   <li>PATCH /api/v1/accounting/daily-closings/{closingDate}/lock — {@code @RequirePermission(accounting.daily-closing.unlock, UPDATE)}</li>
 * </ul>
 *
 * <p>일마감 실행/조회/해제는 각 endpoint 의 {@code @RequirePermission} 권한으로 판정한다.
 */
@RestController
@RequestMapping("/accounting/daily-closings")
@RequiredArgsConstructor
public class DailyClosingController {

    private static final String CALLER_HEADER = "X-User-Id";
    // (사이클2 BE Nit-C3) C5 이후 게이트웨이가 X-User-Role 을 주입하지 않아 항상 null —
    // SP-D2 동적 권한 헬퍼(checkEditPermission/checkViewPermission)는 null 즉시 skip = no-op.
    private static final String ROLE_HEADER = "X-User-Role";

    private final DailyClosingService dailyClosingService;

    /**
     * 일마감 실행 — 지정 날짜의 세금계산서 집계 + 잠금.
     *
     * <p>동일 날짜/거래처 조합이 이미 isLocked=false 이면 재집계 후 잠금.
     * isLocked=true 이면 409 CONFLICT 반환.
     */
    @Operation(summary = "일마감 실행",
            description = "지정 날짜 세금계산서(ISSUED) 집계 후 잠금. 이미 잠근 경우 409.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201",
                    description = "일마감 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403",
                    description = "일마감 실행 권한 없음 — 접근 불가"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404",
                    description = "partnerCode 미존재"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409",
                    description = "이미 잠금된 일마감")
    })
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = "accounting.daily-closing.run", action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    public ApiResponse<DailyClosingResponse> close(
            @Valid @RequestBody CreateDailyClosingRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        return ApiResponse.ok(dailyClosingService.close(request, callerOrSystem(callerHeader), roleHeader));
    }

    /**
     * 일마감 기간 조회.
     *
     * @param from     조회 시작 날짜 (yyyy-MM-dd, 필수)
     * @param to       조회 종료 날짜 (yyyy-MM-dd, 필수)
     * @param pageable 페이지 정보 (기본 page=0, size=20, sort=closingDate,desc)
     */
    @Operation(summary = "일마감 기간 조회", description = "from~to 범위의 일마감 snapshot 페이지 조회.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200",
                    description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403",
                    description = "일마감 조회 권한 없음 — 접근 불가")
    })
    @GetMapping
    @RequirePermission(page = "accounting.daily-closing", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<Page<DailyClosingResponse>> list(
            @Parameter(description = "조회 시작 날짜 (yyyy-MM-dd)")
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @Parameter(description = "조회 종료 날짜 (yyyy-MM-dd)")
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @Parameter(description = "마감 종류 (SALES/PURCHASE). 미지정 시 전체")
            @RequestParam(required = false) DailyClosingKind kind,
            @Parameter(description = "집계 source (TAX_INVOICE/SALES_SLIP/PURCHASE_SLIP). 미지정 시 전체")
            @RequestParam(required = false) DailyClosingSourceKind sourceKind,
            @Parameter(description = "거래처코드 필터 (선택 — 미지정 시 전체 거래처)")
            @RequestParam(required = false) String partnerCode,
            @PageableDefault(size = 20, sort = "closingDate", direction = Sort.Direction.DESC)
            Pageable pageable,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        // [#929 재수렴 T6] partnerCode 는 이전에 여기서 받지 않아 조용히 버려졌다(#929 D).
        return ApiResponse.ok(dailyClosingService.list(from, to, kind, sourceKind, partnerCode, pageable, roleHeader));
    }

    /**
     * 일마감 잠금 해제 — 잠금 해제 권한 보유자 전용.
     *
     * <p>REST 설계: {@code PATCH /daily-closings/{closingDate}/lock}
     * + body {@code {"locked": false}} — 리소스 상태 부분 변경 시맨틱.
     *
     * @param closingDate path variable — 마감 날짜 (yyyy-MM-dd)
     * @param body        잠금 상태 변경 body ({"locked": false})
     * @param partnerCode 거래처코드 query param (null = 전체 마감)
     * @param callerHeader X-User-Id
     * @return 갱신된 DailyClosingResponse
     */
    @Operation(summary = "일마감 잠금 해제",
            description = "PATCH body {\"locked\": false} — isLocked=false 로 전환. lockedAt/By 는 감사 추적을 위해 보존.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200",
                    description = "잠금 해제 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403",
                    description = "일마감 잠금 해제 권한 없음"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404",
                    description = "해당 일마감 미존재"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409",
                    description = "잠금 상태가 아닐 때")
    })
    @PatchMapping("/{closingDate}/lock")
    @ResponseStatus(HttpStatus.OK)
    @RequirePermission(page = "accounting.daily-closing.unlock", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<DailyClosingResponse> unlock(
            @Parameter(description = "마감 날짜 (yyyy-MM-dd)", required = true)
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate closingDate,
            @RequestBody java.util.Map<String, Object> body,
            @Parameter(description = "거래처코드 (null = 전체 마감)")
            @RequestParam(required = false) String partnerCode,
            @Parameter(description = "마감 종류 (SALES/PURCHASE). 미지정 시 SALES")
            @RequestParam(required = false) DailyClosingKind kind,
            @Parameter(description = "집계 source. 미지정 시 TAX_INVOICE")
            @RequestParam(required = false) DailyClosingSourceKind sourceKind,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        // {"locked": false} 만 허용 (현재 unlock only — lock 은 POST /daily-closings 가 담당)
        Object lockedVal = body.get("locked");
        if (!Boolean.FALSE.equals(lockedVal)) {
            throw new com.samhanair.logis.common.exception.BusinessException(
                    com.samhanair.logis.common.exception.ErrorCode.INVALID_INPUT,
                    "현재 이 엔드포인트는 {\"locked\": false} 만 지원합니다");
        }
        return ApiResponse.ok(
                dailyClosingService.unlock(closingDate, partnerCode, kind, sourceKind,
                        callerOrSystem(callerHeader), roleHeader));
    }

    private String callerOrSystem(String header) {
        return (header == null || header.isBlank()) ? "system" : header;
    }
}
