package com.samhanair.logis.slip.estimate.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.slip.estimate.domain.EstimateStatus;
import com.samhanair.logis.slip.estimate.service.EstimateService;
import com.samhanair.logis.slip.estimate.web.dto.CreateEstimateRequest;
import com.samhanair.logis.slip.estimate.web.dto.EstimateDetailResponse;
import com.samhanair.logis.slip.estimate.web.dto.EstimateDetailReadResponse;
import com.samhanair.logis.slip.estimate.web.dto.EstimateReadResponse;
import com.samhanair.logis.slip.estimate.web.dto.EstimateResponse;
import com.samhanair.logis.slip.estimate.web.dto.UpdateEstimateRequest;
import com.samhanair.logis.slip.estimate.web.dto.ChangeEstimateOwnerRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 견적서 REST endpoint — P2-1 (Stage 4).
 *
 * <p>매뉴얼 출처: {@code docs/manual/01-영업/06-견적서.md}.
 *
 * <p>권한 매트릭스 — 권한그룹/동적 override 기반 (C5-4):
 * <ul>
 *   <li>작성 / 수정 / 발송 — estimates.list 권한그룹 CREATE/UPDATE 보유 계정 또는 시스템 MASTER</li>
 *   <li>수락 / 거절 (거래처 의사 대리 입력) — estimates.list UPDATE 보유 계정 또는 시스템 MASTER</li>
 *   <li>변환 (견적 → 슬립) — estimates.list UPDATE 보유 계정 또는 시스템 MASTER</li>
 *   <li>조회 — 모든 인증 사용자 (estimates.list VIEW 동적 가드 추가 적용)</li>
 * </ul>
 *
 * <p>MASTER 판정 기준 (C5-4 actor 전환):
 * X-User-Role 헤더는 게이트웨이에서 더 이상 주입되지 않음.
 * 시스템 MASTER 는 {@code X-Is-System-Master: true} 헤더로만 판정한다.
 * {@link EstimatePermissionGuard} 가 이 헤더를 직접 수신하고
 * {@link com.samhanair.logis.security.permission.PermissionAspect} 와 동일 정책을 적용한다.
 *
 * <p>SP-D6-6 권한 가드:
 * <ul>
 *   <li>GET 조회 → {@code @PreAuthorize("isAuthenticated()")}
 *       + {@link EstimatePermissionGuard#checkView(UUID, String)}</li>
 *   <li>POST/PUT write → {@code @RequirePermission} 단일 가드</li>
 * </ul>
 */
@RestController
@RequestMapping("/slips/estimates")
@RequiredArgsConstructor
public class EstimateController {

    private static final String CALLER_HEADER         = "X-User-Id";
    private static final String CALLER_NAME_HEADER    = "X-User-Name";
    /** C5-4: X-User-Role 제거 — MASTER 판정은 X-Is-System-Master 헤더로만 수행. */
    private static final String SYSTEM_MASTER_HEADER  = "X-Is-System-Master";

    private final EstimateService estimateService;
    private final EstimatePermissionGuard estimatePermissionGuard;

    /** 견적서 페이지 조회 — status / partnerId / 기간 필터 (모두 옵션). */
    @Operation(summary = "견적서 페이지 조회",
            description = "status / partnerId / 기간(start-end) 필터 조합")
    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ApiResponse<Page<EstimateReadResponse>> list(
            @RequestParam(required = false) EstimateStatus status,
            @RequestParam(required = false) UUID partnerId,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(defaultValue = "false") boolean includeDeleted,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
            @RequestHeader(value = SYSTEM_MASTER_HEADER, required = false) String isSystemMaster) {
        estimatePermissionGuard.checkView(parseAccountId(callerHeader), isSystemMaster);
        Pageable pageable = PageRequest.of(page, size);
        return ApiResponse.ok(estimateService.list(status, partnerId, startDate, endDate, includeDeleted, pageable)
                .map(EstimateReadResponse::from));
    }

    /** 웹 표면 자기 담당 목록 — 직원/거래처의 현재 담당 견적만 반환한다. */
    @GetMapping("/assigned")
    @PreAuthorize("isAuthenticated()")
    public ApiResponse<Page<EstimateReadResponse>> assignedList(
            @RequestParam(required = false) EstimateStatus status,
            @RequestParam(required = false) UUID partnerId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(defaultValue = "false") boolean includeDeleted,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(estimateService.listAssigned(callerHeader, status, partnerId,
                startDate, endDate, includeDeleted, PageRequest.of(page, size)).map(EstimateReadResponse::from));
    }

    /** 견적서 단건 상세 조회. */
    @Operation(summary = "견적서 단건 상세", description = "라인 포함")
    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ApiResponse<EstimateDetailReadResponse> getOne(
            @PathVariable String id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
            @RequestHeader(value = SYSTEM_MASTER_HEADER, required = false) String isSystemMaster) {
        estimatePermissionGuard.checkView(parseAccountId(callerHeader), isSystemMaster);
        return ApiResponse.ok(EstimateDetailReadResponse.from(estimateService.getOne(id)));
    }

    /** 견적서 신규 생성 (DRAFT 상태). */
    @Operation(summary = "견적서 생성", description = "DRAFT 상태로 생성. 라인 productId 일괄 검증")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "생성 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "라인/입력 검증 실패")
    })
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = "estimates.list", action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    public ApiResponse<EstimateDetailResponse> create(
            @Valid @RequestBody CreateEstimateRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        return ApiResponse.ok(estimateService.create(request, callerOrSystem(callerHeader), callerName));
    }

    /** 견적서 수정 — DRAFT/SENT 단계만. */
    @Operation(summary = "견적서 수정",
            description = "DRAFT/SENT 단계만. lines 가 있으면 기존 라인 replace. "
                    + "[D-R8-9] 요청에 lineId 계약 마커(lineIdContract=true)가 없으면 구 클라이언트로 판정해 400 으로 거부합니다 — "
                    + "lines 가 null 인 헤더 전용 수정도 마커를 요구합니다(전표 미러).")
    @PutMapping("/{id}")
    @RequirePermission(page = "estimates.list", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<EstimateDetailResponse> update(
            @PathVariable String id,
            @Valid @RequestBody UpdateEstimateRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        return ApiResponse.ok(estimateService.update(estimateService.resolveId(id), request, callerOrSystem(callerHeader), callerName));
    }

    /** DRAFT → SENT. */
    @Operation(summary = "견적서 발송", description = "QUOTE_DRAFT → QUOTE_SENT")
    @PostMapping("/{id}/send")
    @RequirePermission(page = "estimates.list", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<EstimateDetailResponse> send(
            @PathVariable String id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(estimateService.send(estimateService.resolveId(id), callerOrSystem(callerHeader)));
    }

    /** SENT → ACCEPTED. */
    @Operation(summary = "견적서 수주", description = "QUOTE_SENT → QUOTE_ACCEPTED")
    @PostMapping("/{id}/accept")
    @RequirePermission(page = "estimates.list", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<EstimateDetailResponse> accept(
            @PathVariable String id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(estimateService.accept(estimateService.resolveId(id), callerOrSystem(callerHeader)));
    }

    /** SENT → REJECTED. */
    @Operation(summary = "견적서 거절", description = "QUOTE_SENT → QUOTE_REJECTED")
    @PostMapping("/{id}/reject")
    @RequirePermission(page = "estimates.list", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<EstimateDetailResponse> reject(
            @PathVariable String id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(estimateService.reject(estimateService.resolveId(id), callerOrSystem(callerHeader)));
    }

    /** 임의 상태(DRAFT/SENT/ACCEPTED) → CONVERTED — Slip(OUTBOUND DRAFT) 자동 발행. */
    @Operation(summary = "견적 → 슬립 자동 변환",
            description = "임의 상태(DRAFT/SENT/ACCEPTED)에서 언제든지 변환 → QUOTE_CONVERTED + Slip(OUTBOUND DRAFT) 자동 발행")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "변환 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "이미 변환됨/거절된 견적")
    })
    @PostMapping("/{id}/convert")
    @RequirePermission(page = "estimates.list", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<EstimateDetailResponse> convert(
            @PathVariable String id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(estimateService.convert(estimateService.resolveId(id), callerOrSystem(callerHeader)));
    }

    /** 견적서 목록 soft-delete. */
    @Operation(summary = "견적서 soft-delete", description = "목록에서 취소선 삭제 처리. 원장/전환 전표 미접촉.")
    @DeleteMapping("/{id}")
    @RequirePermission(page = EstimatePermissionGuard.PAGE_CODE, action = com.samhanair.logis.security.permission.PermissionAction.DELETE)
    public ApiResponse<Void> delete(
            @PathVariable String id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        estimateService.delete(estimateService.resolveId(id), callerOrSystem(callerHeader), callerName);
        return ApiResponse.ok(null);
    }

    /** 견적서 목록 soft-delete 복원. */
    @Operation(summary = "견적서 soft-delete 복원", description = "삭제행을 활성 견적으로 복원한다. 동일 견적번호 활성행 공존 시 409.")
    @PostMapping("/{id}/restore")
    @RequirePermission(page = EstimatePermissionGuard.PAGE_CODE, action = com.samhanair.logis.security.permission.PermissionAction.RESTORE)
    public ApiResponse<EstimateDetailResponse> restore(
            @PathVariable String id) {
        return ApiResponse.ok(estimateService.restore(estimateService.resolveId(id)));
    }

    /** 웹 표면 자기 담당 삭제 견적 복원. */
    @PostMapping("/assigned/{id}/restore")
    @RequirePermission(page = EstimatePermissionGuard.PAGE_CODE, action = PermissionAction.RESTORE)
    public ApiResponse<EstimateDetailResponse> assignedRestore(
            @PathVariable String id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(estimateService.restoreAssigned(estimateService.resolveId(id), callerHeader));
    }

    /** 견적서 계열 담당 변경. 주문서 계열은 이 endpoint의 계약 대상이 아니다. */
    @PatchMapping("/{id}/owner")
    @RequirePermission(page = EstimatePermissionGuard.PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<EstimateDetailResponse> changeOwner(
            @PathVariable String id,
            @Valid @RequestBody ChangeEstimateOwnerRequest request) {
        return ApiResponse.ok(estimateService.changeOwner(estimateService.resolveId(id), request.requesterId(), request.documentType()));
    }

    private UUID parseAccountId(String header) {
        if (header == null || header.isBlank()) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "계정 권한 식별자가 없습니다.");
        }
        try {
            return UUID.fromString(header);
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "계정 권한 식별자가 올바르지 않습니다.");
        }
    }

    private String callerOrSystem(String header) {
        return (header == null || header.isBlank()) ? "system" : header;
    }
}
