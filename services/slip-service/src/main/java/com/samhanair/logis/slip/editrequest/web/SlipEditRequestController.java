package com.samhanair.logis.slip.editrequest.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.slip.editrequest.domain.SlipEditRequest;
import com.samhanair.logis.slip.editrequest.domain.SlipEditRequestStatus;
import com.samhanair.logis.slip.editrequest.domain.SlipEditTargetRole;
import com.samhanair.logis.slip.editrequest.service.SlipEditRequestService;
import com.samhanair.logis.slip.editrequest.web.dto.ApproveRequest;
import com.samhanair.logis.slip.editrequest.web.dto.CreateEditRequestRequest;
import com.samhanair.logis.slip.editrequest.web.dto.RejectRequest;
import com.samhanair.logis.slip.editrequest.web.dto.SlipEditRequestResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 슬립 수정/삭제 요청 워크플로우 REST endpoint — PR-H3 (Phase 12 Step 3).
 *
 * <p>endpoint:
 * <ul>
 *   <li>{@code POST /slips/{id}/edit-request {type, reason}} — 요청 생성 (작성자/SALES/MANAGER/MASTER)</li>
 *   <li>{@code POST /slips/{id}/edit-request/{requestId}/approve {note?}} — 수락 (WAREHOUSE/MANAGER/MASTER)</li>
 *   <li>{@code POST /slips/{id}/edit-request/{requestId}/reject {reason}} — 거절 (WAREHOUSE/MANAGER/MASTER)</li>
 *   <li>{@code GET  /slips/edit-requests?status=PENDING&targetRole=WAREHOUSE} — 권한자 대시보드</li>
 * </ul>
 *
 * <p>권한 매트릭스:
 * <ul>
 *   <li>요청 생성 — SALES, MANAGER, MASTER (작성자 본인 또는 위임)</li>
 *   <li>수락/거절 — WAREHOUSE, MANAGER, MASTER (사용자 명시 잠금 정책)</li>
 *   <li>대시보드 조회 — WAREHOUSE, MANAGER, MASTER (본인 권한 그룹의 PENDING)</li>
 * </ul>
 *
 * <p>응답 형식 = {@link ApiResponse} wrapper.
 */
@RestController
@RequestMapping("/slips")
@RequiredArgsConstructor
public class SlipEditRequestController {

    private static final String CALLER_ID_HEADER = "X-User-Id";
    private static final String CALLER_NAME_HEADER = "X-User-Name";

    private final SlipEditRequestService editRequestService;

    /**
     * 슬립 수정/삭제 요청 생성 — 사용자 명시 잠금 정책에 따른 status 가드 적용.
     */
    @Operation(summary = "슬립 수정/삭제 요청 생성",
            description = "PR-H3 — CONFIRMED/ACCEPTED/PROCESSING 단계 슬립의 mutation 잠금 해제 요청 + 창고 알림")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "요청 생성 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400",
                    description = "DRAFT/SAVED/SENT (작성자 직접 가능) 또는 REJECTED/CANCELED (종결)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "슬립 미존재"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409",
                    description = "INSPECTING/SHIPPING/DELIVERED (완전 잠금)")
    })
    @PostMapping("/{slipId}/edit-request")
    @RequirePermission(page = "slip.edit-requests", action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    public ResponseEntity<ApiResponse<SlipEditRequestResponse>> createRequest(
            @PathVariable UUID slipId,
            @Valid @RequestBody CreateEditRequestRequest request,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        UUID requesterId = parseActorId(callerId);
        String requesterName = resolveName(callerId, callerName);
        SlipEditRequest saved = editRequestService.request(slipId, request.type(),
                request.reason(), requesterId, requesterName);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(SlipEditRequestResponse.from(saved)));
    }

    /**
     * 요청 수락 — 권한자 (창고/관리자) 만 호출 가능. 작성자에게 푸시 알림 발송.
     */
    @Operation(summary = "수정/삭제 요청 수락",
            description = "PR-H3 — 권한자 수락 시 작성자가 1회 mutation 가능 + 푸시 알림 + SSE broadcast")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "수락 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "요청 미존재"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "이미 종결된 요청")
    })
    @PostMapping("/{slipId}/edit-request/{requestId}/approve")
    @RequirePermission(page = "slip.edit-requests.decide", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<SlipEditRequestResponse> approveRequest(
            @PathVariable UUID slipId,
            @PathVariable UUID requestId,
            @Valid @RequestBody(required = false) ApproveRequest body,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        UUID approverId = parseActorId(callerId);
        String approverName = resolveName(callerId, callerName);
        String note = body == null ? null : body.note();
        SlipEditRequest updated = editRequestService.approve(requestId, approverId, approverName, note);
        return ApiResponse.ok(SlipEditRequestResponse.from(updated));
    }

    /**
     * 요청 거절 — 권한자만 호출 가능. 거절 사유 필수. 작성자에게 사유 푸시 알림.
     */
    @Operation(summary = "수정/삭제 요청 거절",
            description = "PR-H3 — 권한자 거절 시 작성자에게 거절 사유 푸시 + SSE broadcast")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "거절 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "거절 사유 누락"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "요청 미존재"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "이미 종결된 요청")
    })
    @PostMapping("/{slipId}/edit-request/{requestId}/reject")
    @RequirePermission(page = "slip.edit-requests.decide", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<SlipEditRequestResponse> rejectRequest(
            @PathVariable UUID slipId,
            @PathVariable UUID requestId,
            @Valid @RequestBody RejectRequest body,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        UUID approverId = parseActorId(callerId);
        String approverName = resolveName(callerId, callerName);
        SlipEditRequest updated = editRequestService.reject(requestId, approverId, approverName,
                body.reason());
        return ApiResponse.ok(SlipEditRequestResponse.from(updated));
    }

    /**
     * 권한자 대시보드 — 본인 그룹의 PENDING 요청 전체 (또는 status 필터). 응답 즉시 수락/거절 분기.
     *
     * <p>{@code targetRole} param 필수 — 호출자가 소속 그룹 명시 (FE 가 user role 에서 도출).
     */
    @Operation(summary = "권한자 대시보드 — PENDING 요청 목록",
            description = "PR-H3 — 본인 권한 그룹 (WAREHOUSE/MANAGER) 의 PENDING 요청 목록 (대시보드)")
    @GetMapping("/edit-requests")
    @RequirePermission(page = "slip.edit-requests.decide", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<List<SlipEditRequestResponse>> listForRole(
            @RequestParam SlipEditTargetRole targetRole) {
        // 본 PR 시범 — PENDING 대시보드 한정. APPROVED/REJECTED/EXPIRED 는 slip 화면별 endpoint
        // ({@link #listBySlip}) 사용 — 권한자 대시보드는 "신규 처리 대기" 영역.
        List<SlipEditRequest> rows = editRequestService.listPendingForRole(targetRole);
        return ApiResponse.ok(rows.stream().map(SlipEditRequestResponse::from).toList());
    }

    /**
     * 슬립별 요청 이력 — slip 화면 표시용. status null 이면 전체.
     */
    @Operation(summary = "슬립별 요청 이력",
            description = "PR-H3 — slip 화면의 '수정 요청 이력' 섹션. status filter 선택")
    @GetMapping("/{slipId}/edit-requests")
    @RequirePermission(page = "slip.edit-requests", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<List<SlipEditRequestResponse>> listBySlip(
            @PathVariable UUID slipId,
            @RequestParam(required = false) SlipEditRequestStatus status) {
        List<SlipEditRequest> rows = editRequestService.listBySlip(slipId, status);
        return ApiResponse.ok(rows.stream().map(SlipEditRequestResponse::from).toList());
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

    private String resolveName(String callerId, String callerName) {
        return ActorDisplayName.resolve(callerId, callerName);
    }
}
