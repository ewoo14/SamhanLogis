package com.samhanair.logis.arologis.controller;

import com.samhanair.logis.arologis.domain.DispatchType;
import com.samhanair.logis.arologis.dto.AvailableDriverResponse;
import com.samhanair.logis.arologis.dto.DispatchPageResponse;
import com.samhanair.logis.arologis.dto.DriverChangeRequest;
import com.samhanair.logis.arologis.dto.ManualAssignRequest;
import com.samhanair.logis.arologis.service.DispatchAdminService;
import com.samhanair.logis.arologis.service.DispatchService;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * P1-5 배차 Admin UI 전용 endpoint — /api/v1/arologis/admin prefix.
 *
 * <p>기존 {@link ArologisAdminController} (/admin/arologis) 는 유지. 본 controller 는
 * admin UI backing 5 endpoint 만 담당:
 * <ol>
 *   <li>{@code GET  /api/v1/arologis/admin/dispatches} — 배차 list (페이징 + 기간/상태 필터)</li>
 *   <li>{@code POST /api/v1/arologis/admin/dispatches/auto-match} — 자동 매칭 trigger (카카오톡)</li>
 *   <li>{@code POST /api/v1/arologis/admin/dispatches/{id}/manual-assign} — 수동 배차</li>
 *   <li>{@code PATCH /api/v1/arologis/admin/dispatches/{id}/driver} — 기사 변경</li>
 *   <li>{@code GET  /api/v1/arologis/admin/drivers/available} — 가용 기사 list</li>
 * </ol>
 *
 * <p>권한 — {@code @PreAuthorize("hasAnyRole('MASTER','MANAGER','AROLOGIS_MASTER','AROLOGIS_MANAGER')")} 전체 적용.
 * UUID 비공개 가드 — dispatchId (admin routing 용) 만 노출, driver / vehicle UUID 는 미포함.
 *
 * <p>SP-D3 동적 권한 이중 가드:
 * <ul>
 *   <li>{@code dispatch.board} 페이지 코드 — GET 배차 list 에 VIEW 가드, POST/PATCH write 에 EDIT 가드 적용</li>
 *   <li>canEdit=false + canView=true → 403, canEdit=false + canView=false → fallback 통과</li>
 * </ul>
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/arologis/admin")
@RequiredArgsConstructor
@Tag(name = "P1-5 배차 Admin UI", description = "배차 list / 자동매칭 / 수동배차 / 기사변경 / 가용기사 조회")
public class DispatchAdminV1Controller {

    private final DispatchAdminService dispatchAdminService;

    // ========================================================================
    // 1. 배차 list (페이징 + 기간 / status 필터)
    // ========================================================================

    /**
     * 배차 list 조회 — P1-5 카카오톡 배차 admin UI 목록 화면.
     *
     * <p>status (DispatchType) / fromDate / toDate / page / size 필터. fromDate 미지정 시 오늘.
     * toDate 미지정 시 fromDate. page 는 0-based. size 기본 20.
     *
     * @param status   배차 유형 필터 (DAY / NIGHT / EXPRESS, 선택)
     * @param fromDate 조회 시작일 (ISO YYYY-MM-DD, 선택)
     * @param toDate   조회 종료일 (ISO YYYY-MM-DD, 선택)
     * @param page     페이지 번호 0-based (기본 0)
     * @param size     페이지 크기 (기본 20)
     * @return 페이징 배차 목록
     */
    @Operation(summary = "배차 list 조회 (P1-5 Admin UI)",
            description = "status/fromDate/toDate 필터 + 페이징. fromDate 미지정 시 오늘.")
    @GetMapping("/dispatches")
    @RequirePermission(page = "arologis.dispatch.admin", action = "VIEW")
    public ApiResponse<DispatchPageResponse> listDispatches(
            @RequestParam(required = false) DispatchType status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fromDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate toDate,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestHeader(value = "X-User-Role", required = false) String roleHeader) {
        if (size < 1 || size > 200) {
            size = 20;
        }
        if (page < 0) {
            page = 0;
        }
        return ApiResponse.ok(dispatchAdminService.listDispatches(status, fromDate, toDate, page, size));
    }

    // ========================================================================
    // 2. 자동 매칭 trigger — 카카오톡 배차 (DriverMatcher 호출)
    // ========================================================================

    /**
     * 자동 매칭 trigger — P1-5 카카오톡 배차 admin UI §4-2.
     *
     * <p>dispatchId 지정 배차의 모든 PENDING vehicle 에 대해 활성 DriverMatcher 호출.
     * Mock 모드 = SAMHAN_AROLOGIS_MATCHER_PROVIDER=mock (기본), Insung = insung-quick.
     *
     * @param dispatchId 배차 UUID (admin routing 용)
     * @return 자동 매칭 결과 (totalVehicles / matched)
     */
    @Operation(summary = "자동 매칭 trigger (P1-5 Admin UI, 카카오톡 배차)",
            description = "dispatchId 배차의 PENDING 차량 전체에 DriverMatcher 자동 매칭 호출.")
    @PostMapping("/dispatches/auto-match")
    @RequirePermission(page = "arologis.dispatch.admin", action = "EDIT")
    public ApiResponse<DispatchService.AutoMatchResult> autoMatch(
            @RequestBody Map<String, String> body,
            @RequestHeader(value = "X-User-Role", required = false) String roleHeader) {
        String dispatchIdStr = body == null ? null : body.get("dispatchId");
        if (dispatchIdStr == null || dispatchIdStr.isBlank()) {
            throw new com.samhanair.logis.common.exception.BusinessException(
                    com.samhanair.logis.common.exception.ErrorCode.INVALID_INPUT, "dispatchId 필수");
        }
        UUID dispatchId;
        try {
            dispatchId = UUID.fromString(dispatchIdStr);
        } catch (IllegalArgumentException ex) {
            throw new com.samhanair.logis.common.exception.BusinessException(
                    com.samhanair.logis.common.exception.ErrorCode.INVALID_INPUT,
                    "dispatchId 형식 오류: " + dispatchIdStr);
        }
        DispatchService.AutoMatchResult result = dispatchAdminService.triggerAutoMatch(dispatchId);
        log.info("자동 매칭 trigger — dispatchId={} totalVehicles={} matched={}",
                dispatchId, result.totalVehicles(), result.matched());
        return ApiResponse.ok(result);
    }

    // ========================================================================
    // 3. 수동 배차 — admin UI P1-5 §4-3
    // ========================================================================

    /**
     * 수동 배차 — P1-5 정식 admin 배차 UI.
     *
     * <p>vehicleSeq + driverCode 지정으로 배차 내 특정 차량에 기사 수동 배정.
     * MatchSource.MANUAL 로 기록. UUID 비공개 가드 — driverCode 로 기사 식별.
     *
     * @param id  배차 UUID (admin routing 용 경로 파라미터)
     * @param req 수동 배차 요청 (vehicleSeq + driverCode)
     * @return 처리 결과 (dispatchId + vehicleSeq + driverCode)
     */
    @Operation(summary = "수동 배차 (P1-5 Admin UI)",
            description = "vehicleSeq + driverCode 지정. MatchSource.MANUAL 기록.")
    @PostMapping("/dispatches/{id}/manual-assign")
    @RequirePermission(page = "arologis.dispatch.admin", action = "EDIT")
    public ApiResponse<Map<String, Object>> manualAssign(
            @PathVariable UUID id,
            @Valid @RequestBody ManualAssignRequest req,
            @RequestHeader(value = "X-User-Role", required = false) String roleHeader) {
        dispatchAdminService.manualAssign(id, req.vehicleSeq(), req.driverCode());
        return ApiResponse.ok(Map.of(
                "dispatchId", id.toString(),
                "vehicleSeq", req.vehicleSeq(),
                "driverCode", req.driverCode()));
    }

    // ========================================================================
    // 4. 기사 변경 — admin UI P1-5 §4-4
    // ========================================================================

    /**
     * 기사 변경 — P1-5 기사 배정 admin UI.
     *
     * <p>이미 ASSIGNED 상태인 차량도 기사 변경 가능. vehicleSeq + newDriverCode 지정으로
     * 기존 배정 기사를 교체. MatchSource.MANUAL 로 재기록.
     *
     * @param id  배차 UUID (admin routing 용)
     * @param req 기사 변경 요청 (vehicleSeq + newDriverCode)
     * @return 처리 결과 (dispatchId + vehicleSeq + newDriverCode)
     */
    @Operation(summary = "기사 변경 (P1-5 Admin UI)",
            description = "vehicleSeq + newDriverCode 지정으로 기존 기사 교체. MatchSource.MANUAL.")
    @PatchMapping("/dispatches/{id}/driver")
    @RequirePermission(page = "arologis.dispatch.admin", action = "EDIT")
    public ApiResponse<Map<String, Object>> changeDriver(
            @PathVariable UUID id,
            @Valid @RequestBody DriverChangeRequest req,
            @RequestHeader(value = "X-User-Role", required = false) String roleHeader) {
        dispatchAdminService.changeDriver(id, req.vehicleSeq(), req.newDriverCode());
        return ApiResponse.ok(Map.of(
                "dispatchId", id.toString(),
                "vehicleSeq", req.vehicleSeq(),
                "newDriverCode", req.newDriverCode()));
    }

    // ========================================================================
    // 5. 가용 기사 list — admin UI P1-5 §4-5
    // ========================================================================

    /**
     * 가용 기사 list — P1-5 기사 배정 admin UI 후보 조회.
     *
     * <p>date 기준 ASSIGNED / DEPARTED 상태 배차에 이미 배정된 기사 제외. zoneId 필터는
     * vehicleType 에 포함되는 문자열 기준 (단순 contains). UUID 비공개 가드 적용.
     *
     * @param date   조회 기준 일자 (ISO YYYY-MM-DD, 선택, 기본 = 오늘)
     * @param zoneId 권역 ID 필터 (선택, vehicleType 포함 문자열)
     * @return 가용 기사 응답
     */
    @Operation(summary = "가용 기사 list (P1-5 Admin UI)",
            description = "date 기준 배정 기사 제외 + zoneId 필터. UUID 비공개 가드 적용.")
    @GetMapping("/drivers/available")
    @RequirePermission(page = "arologis.dispatch.admin", action = "VIEW")
    public ApiResponse<AvailableDriverResponse> availableDrivers(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(required = false) String zoneId) {
        return ApiResponse.ok(dispatchAdminService.findAvailableDrivers(date, zoneId));
    }

}
