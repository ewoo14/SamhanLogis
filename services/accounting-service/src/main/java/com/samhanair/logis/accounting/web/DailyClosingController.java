package com.samhanair.logis.accounting.web;

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
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
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
 *   <li>POST /api/v1/accounting/daily-closings — ACCOUNTANT, MANAGER, MASTER (일마감 실행)</li>
 *   <li>GET  /api/v1/accounting/daily-closings — ACCOUNTANT, MANAGER, MASTER (기간 조회)</li>
 *   <li>POST /api/v1/accounting/daily-closings/unlock — MASTER 만 (잠금 해제)</li>
 * </ul>
 *
 * <p>SALES role 은 일마감 endpoint 에 접근 불가 (매뉴얼 §4 권한표).
 */
@RestController
@RequestMapping("/api/v1/accounting/daily-closings")
@RequiredArgsConstructor
public class DailyClosingController {

    private static final String CALLER_HEADER = "X-User-Id";

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
                    description = "SALES role — 접근 불가"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404",
                    description = "partnerCode 미존재"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409",
                    description = "이미 잠금된 일마감")
    })
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('ACCOUNTANT','MANAGER','MASTER')")
    public ApiResponse<DailyClosingResponse> close(
            @Valid @RequestBody CreateDailyClosingRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(dailyClosingService.close(request, callerOrSystem(callerHeader)));
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
                    description = "SALES role — 접근 불가")
    })
    @GetMapping
    @PreAuthorize("hasAnyRole('ACCOUNTANT','MANAGER','MASTER')")
    public ApiResponse<Page<DailyClosingResponse>> list(
            @Parameter(description = "조회 시작 날짜 (yyyy-MM-dd)")
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @Parameter(description = "조회 종료 날짜 (yyyy-MM-dd)")
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @PageableDefault(size = 20, sort = "closingDate", direction = Sort.Direction.DESC)
            Pageable pageable) {
        return ApiResponse.ok(dailyClosingService.list(from, to, pageable));
    }

    /**
     * 일마감 잠금 해제 — MASTER 전용.
     *
     * @param closingDate 마감 날짜
     * @param partnerCode 거래처코드 (null = 전체 마감)
     */
    @Operation(summary = "일마감 잠금 해제 (MASTER 전용)",
            description = "isLocked=false 로 전환. lockedAt/By 는 감사 추적을 위해 보존.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200",
                    description = "잠금 해제 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403",
                    description = "MASTER 가 아닐 때"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404",
                    description = "해당 일마감 미존재"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409",
                    description = "잠금 상태가 아닐 때")
    })
    @PostMapping("/unlock")
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<DailyClosingResponse> unlock(
            @Parameter(description = "마감 날짜 (yyyy-MM-dd)")
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate closingDate,
            @Parameter(description = "거래처코드 (null = 전체 마감)")
            @RequestParam(required = false) String partnerCode,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(
                dailyClosingService.unlock(closingDate, partnerCode, callerOrSystem(callerHeader)));
    }

    private String callerOrSystem(String header) {
        return (header == null || header.isBlank()) ? "system" : header;
    }
}
