package com.samhanair.logis.inventory.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.inventory.domain.AuditStatus;
import com.samhanair.logis.inventory.realtime.service.InventoryAuditLogRecorder;
import com.samhanair.logis.inventory.realtime.service.InventoryEditRequestService;
import com.samhanair.logis.inventory.realtime.web.dto.InventoryAuditLogResponse;
import com.samhanair.logis.inventory.realtime.web.dto.InventoryEditRequestResponse;
import com.samhanair.logis.inventory.service.InventoryAuditService;
import com.samhanair.logis.inventory.web.dto.AuditDetailResponse;
import com.samhanair.logis.inventory.web.dto.AuditLineRequest;
import com.samhanair.logis.inventory.web.dto.AuditResponse;
import com.samhanair.logis.inventory.web.dto.CreateAuditRequest;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import com.samhanair.logis.shared.realtime.editrequest.EditRequestType;
import com.samhanair.logis.shared.realtime.editrequest.EditTargetRole;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import com.samhanair.logis.common.security.ActorDisplayName;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 재고 실사 endpoint (Phase 10 P2-6 슬라이스 9). 한국 일반기업회계기준 의무 실사.
 *
 * <p>권한 매트릭스 (memory ROLE 풀네임 의무):
 * <ul>
 *   <li>조회 (GET) — MASTER / MANAGER / DEVELOPER / ACCOUNTANT / WAREHOUSE / INVENTORY</li>
 *   <li>생성 (POST /inventory/audits) — MASTER / MANAGER / INVENTORY</li>
 *   <li>start — MASTER / MANAGER / INVENTORY</li>
 *   <li>라인 입력 (POST/PUT lines) — MASTER / MANAGER / WAREHOUSE / INVENTORY (모바일 작업자 포함)</li>
 *   <li>complete — MASTER / MANAGER / INVENTORY (분개 trigger 권한)</li>
 *   <li>cancel — MASTER / MANAGER / INVENTORY</li>
 * </ul>
 *
 * <p>UUID 비공개 원칙 (memory feedback_uuid_no_user_visibility) — id 는 mutation path key 전용,
 * 사용자 노출 식별자는 auditNo / warehouseCode / productName.
 */
@RestController
@RequestMapping("/inventory/audits")
@RequiredArgsConstructor
public class InventoryAuditController {

    private static final String CALLER_HEADER = "X-User-Id";
    private static final String CALLER_NAME_HEADER = "X-User-Name";

    private final InventoryAuditService auditService;
    private final InventoryAuditLogRecorder auditLogRecorder;
    private final InventoryEditRequestService editRequestService;
    private final RealtimeBroker realtimeBroker;

    /**
     * 재고 실사 목록 조회 — warehouse / year / status 필터.
     *
     * @param warehouseId 창고 필터 (null 가능)
     * @param year        연도 필터 (null 가능)
     * @param status      상태 필터 (null 가능)
     * @param page        0-based 페이지 번호
     * @param size        페이지 크기 (기본 20)
     * @return Page&lt;AuditResponse&gt;
     */
    @Operation(summary = "재고 실사 목록", description = "warehouse/year/status 필터 페이지")
    @GetMapping
    @RequirePermission(page = "inventory.detail", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<Page<AuditResponse>> list(
            @RequestParam(required = false) UUID warehouseId,
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) AuditStatus status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(page, size);
        return ApiResponse.ok(auditService.list(warehouseId, year, status, pageable));
    }

    /**
     * 재고 실사 단건 상세 (라인 포함).
     *
     * @param id 실사 UUID
     * @return AuditDetailResponse
     */
    @Operation(summary = "재고 실사 단건 상세")
    @GetMapping("/{id}")
    @RequirePermission(page = "inventory.detail", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<AuditDetailResponse> getOne(@PathVariable UUID id) {
        return ApiResponse.ok(auditService.getOne(id));
    }

    /**
     * 재고 실사 신규 등록 — PLANNED 생성 + snapshot 라인 자동 생성.
     *
     * @param request CreateAuditRequest (warehouseId / auditDate)
     * @return AuditDetailResponse (201)
     */
    @Operation(summary = "재고 실사 등록",
            description = "PLANNED 생성. 해당 창고의 모든 활성 stock_balance 를 snapshot 라인으로 자동 생성")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "생성 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "warehouse 미발견")
    })
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = "inventory.adjust", action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    public ApiResponse<AuditDetailResponse> create(
            @Valid @RequestBody CreateAuditRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(auditService.create(request, callerOrSystem(callerHeader)));
    }

    /**
     * 실사 시작 — PLANNED → IN_PROGRESS.
     *
     * @return AuditDetailResponse (200) / CONFLICT (409)
     */
    @Operation(summary = "실사 시작", description = "PLANNED → IN_PROGRESS")
    @PostMapping("/{id}/start")
    @RequirePermission(page = "inventory.adjust", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<AuditDetailResponse> start(@PathVariable UUID id) {
        return ApiResponse.ok(auditService.start(id));
    }

    /**
     * 라인 입력 (POST) — productId 로 snapshot 라인 검색해 actual_qty set.
     *
     * @param id      실사 UUID
     * @param request AuditLineRequest (productId 또는 productCode / actualQty / scanned)
     * @return AuditDetailResponse (200)
     */
    @Operation(summary = "라인 입력 (바코드/수동)",
            description = "productId 또는 productCode 로 snapshot 라인 검색해 actual_qty set. scanned=true 면 바코드 스캔")
    @PostMapping("/{id}/lines")
    @RequirePermission(page = "inventory.stock-balance", action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    public ApiResponse<AuditDetailResponse> recordLine(
            @PathVariable UUID id,
            @Valid @RequestBody AuditLineRequest request) {
        return ApiResponse.ok(auditService.recordLine(id, request));
    }

    /**
     * 라인 수정 (PUT) — lineId path 직접 수정. productId mismatch 검증.
     *
     * @param id      실사 UUID
     * @param lineId  라인 UUID
     * @param request AuditLineRequest
     * @return AuditDetailResponse (200)
     */
    @Operation(summary = "라인 수정", description = "lineId 직접 수정. productId mismatch 검증")
    @PutMapping("/{id}/lines/{lineId}")
    @RequirePermission(page = "inventory.stock-balance", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<AuditDetailResponse> updateLine(
            @PathVariable UUID id,
            @PathVariable UUID lineId,
            @Valid @RequestBody AuditLineRequest request) {
        return ApiResponse.ok(auditService.updateLine(id, lineId, request));
    }

    /**
     * 실사 완료 — IN_PROGRESS → COMPLETED + 차이 자동 분개 trigger + Stock 조정.
     *
     * @return AuditDetailResponse (200) / CONFLICT (409)
     */
    @Operation(summary = "실사 완료",
            description = "IN_PROGRESS → COMPLETED + 차이 자동 분개 (1462/9399) + Stock 조정")
    @PostMapping("/{id}/complete")
    @RequirePermission(page = "inventory.adjust", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<AuditDetailResponse> complete(
            @PathVariable UUID id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        return ApiResponse.ok(auditService.complete(id, callerOrSystem(callerHeader)));
    }

    /**
     * 실사 취소 — PLANNED/IN_PROGRESS → CANCELLED. 분개/Stock 조정 안 함.
     *
     * @return AuditDetailResponse (200) / CONFLICT (409)
     */
    @Operation(summary = "실사 취소", description = "PLANNED/IN_PROGRESS → CANCELLED")
    @PostMapping("/{id}/cancel")
    @RequirePermission(page = "inventory.adjust", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<AuditDetailResponse> cancel(@PathVariable UUID id) {
        return ApiResponse.ok(auditService.cancel(id));
    }

    // ============================================================
    // PR-H4b (Phase 12 Step 4b) — shared:realtime-abstraction 활성
    // ============================================================

    /**
     * 실사 audit timeline — FE timeline 표시용. 최신 revision 우선, soft-deleted 자동 제외.
     */
    @Operation(summary = "재고 실사 audit timeline (PR-H4b)",
            description = "InventoryAudit/StockBalance 등 변경 이력 (최신 revision 우선)")
    @GetMapping("/{id}/audit-logs")
    @RequirePermission(page = "inventory.detail", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<List<InventoryAuditLogResponse>> listAuditLogs(@PathVariable UUID id) {
        return ApiResponse.ok(auditLogRecorder.listByEntity(id).stream()
                .map(InventoryAuditLogResponse::from).toList());
    }

    /**
     * 실사 SSE realtime — entity 별 audit / edit-request event 구독.
     *
     * <p>{@code text/event-stream} stream — heartbeat 30s. 클라이언트는 EventSource API 로 subscribe.
     */
    @Operation(summary = "재고 실사 SSE realtime 구독 (PR-H4b)",
            description = "audit/edit-request event SSE stream — heartbeat 30s")
    @GetMapping(value = "/{id}/realtime", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @RequirePermission(page = "inventory.detail", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public SseEmitter subscribeRealtime(@PathVariable UUID id) {
        return realtimeBroker.subscribe(id);
    }

    /**
     * 수정/삭제 요청 생성 — InventoryAudit COMPLETED 단계에서 본문 변경 채널.
     */
    @Operation(summary = "수정/삭제 요청 생성 (PR-H4b)",
            description = "InventoryAudit COMPLETED 후 MANAGER 수락 1회 소진 후 mutation 가능")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "요청 생성 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "PLANNED/IN_PROGRESS/CANCELLED 단계"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "실사 미존재")
    })
    @PostMapping("/{id}/edit-requests")
    @RequirePermission(page = "inventory.edit-requests", action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    public ApiResponse<InventoryEditRequestResponse> createEditRequest(
            @PathVariable UUID id,
            @RequestBody Map<String, String> body,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        EditRequestType requestType = parseRequestType(body == null ? null : body.get("requestType"));
        String reason = body == null ? null : body.get("reason");
        return ApiResponse.ok(InventoryEditRequestResponse.from(
                editRequestService.request(id, requestType, reason,
                        parseActorId(callerId), resolveActorName(callerId, callerName))));
    }

    /** 권한자 그룹 PENDING 대시보드 (관리자 화면). */
    @Operation(summary = "PENDING 요청 대시보드 (PR-H4b)",
            description = "MANAGER 권한자가 수락/거절 대상 요청 목록 조회")
    @GetMapping("/edit-requests/pending")
    @RequirePermission(page = "inventory.edit-requests.decide", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<List<InventoryEditRequestResponse>> listPending(
            @RequestParam(defaultValue = "MANAGER") EditTargetRole targetRole) {
        return ApiResponse.ok(editRequestService.listPendingForRole(targetRole).stream()
                .map(InventoryEditRequestResponse::from).toList());
    }

    /** 요청 수락. */
    @Operation(summary = "수정/삭제 요청 수락 (PR-H4b)")
    @PostMapping("/edit-requests/{requestId}/approve")
    @RequirePermission(page = "inventory.edit-requests.decide", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<InventoryEditRequestResponse> approveEditRequest(
            @PathVariable UUID requestId,
            @RequestBody(required = false) Map<String, String> body,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        String note = body == null ? null : body.get("note");
        return ApiResponse.ok(InventoryEditRequestResponse.from(
                editRequestService.approve(requestId,
                        parseActorId(callerId), resolveActorName(callerId, callerName), note)));
    }

    /** 요청 거절. */
    @Operation(summary = "수정/삭제 요청 거절 (PR-H4b)")
    @PostMapping("/edit-requests/{requestId}/reject")
    @RequirePermission(page = "inventory.edit-requests.decide", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<InventoryEditRequestResponse> rejectEditRequest(
            @PathVariable UUID requestId,
            @RequestBody Map<String, String> body,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        String reason = body == null ? null : body.get("decisionReason");
        return ApiResponse.ok(InventoryEditRequestResponse.from(
                editRequestService.reject(requestId,
                        parseActorId(callerId), resolveActorName(callerId, callerName), reason)));
    }

    private EditRequestType parseRequestType(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new com.samhanair.logis.common.exception.BusinessException(
                    com.samhanair.logis.common.exception.ErrorCode.INVALID_INPUT,
                    "requestType 필수 (EDIT/DELETE)");
        }
        try {
            return EditRequestType.valueOf(raw);
        } catch (IllegalArgumentException ex) {
            throw new com.samhanair.logis.common.exception.BusinessException(
                    com.samhanair.logis.common.exception.ErrorCode.INVALID_INPUT,
                    "잘못된 requestType: " + raw);
        }
    }

    private UUID parseActorId(String callerId) {
        if (callerId == null || callerId.isBlank()) {
            return new UUID(0L, 0L);
        }
        try {
            return UUID.fromString(callerId);
        } catch (IllegalArgumentException ex) {
            return new UUID(0L, 0L);
        }
    }

    private String resolveActorName(String callerId, String callerName) {
        return ActorDisplayName.resolve(callerId, callerName);
    }

    private String callerOrSystem(String header) {
        return (header == null || header.isBlank()) ? "system" : header;
    }
}
