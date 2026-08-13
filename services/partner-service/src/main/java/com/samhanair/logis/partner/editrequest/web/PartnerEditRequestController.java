package com.samhanair.logis.partner.editrequest.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.partner.editrequest.domain.PartnerEditRequest;
import com.samhanair.logis.partner.editrequest.service.PartnerEditRequestService;
import com.samhanair.logis.partner.editrequest.web.dto.ApprovePartnerRequest;
import com.samhanair.logis.partner.editrequest.web.dto.CreatePartnerEditRequestRequest;
import com.samhanair.logis.partner.editrequest.web.dto.PartnerEditRequestResponse;
import com.samhanair.logis.partner.editrequest.web.dto.RejectPartnerRequest;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.shared.realtime.editrequest.EditTargetRole;
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
 * 거래처 도메인 수정/삭제 요청 워크플로우 REST endpoint — PR-H4b (Phase 12 Step 4b).
 *
 * <p>endpoint:
 * <ul>
 *   <li>{@code POST /admin/partners/entities/{entityId}/edit-request}</li>
 *   <li>{@code POST /admin/partners/edit-requests/{requestId}/approve}</li>
 *   <li>{@code POST /admin/partners/edit-requests/{requestId}/reject}</li>
 *   <li>{@code GET  /admin/partners/edit-requests?targetRole=MANAGER}</li>
 *   <li>{@code GET  /admin/partners/entities/{entityId}/edit-requests}</li>
 * </ul>
 *
 * <p>권한: 요청 = MASTER / MANAGER / ACCOUNTANT, 수락/거절 = MASTER / MANAGER.
 */
@RestController
@RequestMapping("/admin/partners")
@RequiredArgsConstructor
public class PartnerEditRequestController {

    private static final String CALLER_ID_HEADER = "X-User-Id";
    private static final String CALLER_NAME_HEADER = "X-User-Name";

    private final PartnerEditRequestService editRequestService;

    @Operation(summary = "거래처 entity 수정/삭제 요청 생성",
            description = "PR-H4b — Partner / BlockedPartner 잠금 mutation 해제 요청")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "요청 생성 성공")
    })
    @PostMapping("/entities/{entityId}/edit-request")
    @RequirePermission(page = "partners.edit-requests", action = PermissionAction.CREATE)
    public ResponseEntity<ApiResponse<PartnerEditRequestResponse>> createRequest(
            @PathVariable UUID entityId,
            @Valid @RequestBody CreatePartnerEditRequestRequest request,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        UUID requesterId = parseActorId(callerId);
        String requesterName = resolveName(callerId, callerName);
        PartnerEditRequest saved = editRequestService.request(entityId, request.type(),
                request.reason(), requesterId, requesterName);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(PartnerEditRequestResponse.from(saved)));
    }

    @Operation(summary = "거래처 수정/삭제 요청 수락")
    @PostMapping("/edit-requests/{requestId}/approve")
    @RequirePermission(page = "partners.edit-requests.decide", action = PermissionAction.UPDATE)
    public ApiResponse<PartnerEditRequestResponse> approveRequest(
            @PathVariable UUID requestId,
            @Valid @RequestBody(required = false) ApprovePartnerRequest body,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        UUID approverId = parseActorId(callerId);
        String approverName = resolveName(callerId, callerName);
        String note = body == null ? null : body.note();
        PartnerEditRequest updated = editRequestService.approve(requestId, approverId, approverName, note);
        return ApiResponse.ok(PartnerEditRequestResponse.from(updated));
    }

    @Operation(summary = "거래처 수정/삭제 요청 거절")
    @PostMapping("/edit-requests/{requestId}/reject")
    @RequirePermission(page = "partners.edit-requests.decide", action = PermissionAction.UPDATE)
    public ApiResponse<PartnerEditRequestResponse> rejectRequest(
            @PathVariable UUID requestId,
            @Valid @RequestBody RejectPartnerRequest body,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        UUID approverId = parseActorId(callerId);
        String approverName = resolveName(callerId, callerName);
        PartnerEditRequest updated = editRequestService.reject(requestId, approverId, approverName,
                body.reason());
        return ApiResponse.ok(PartnerEditRequestResponse.from(updated));
    }

    @Operation(summary = "거래처 수정 요청 대시보드 — PENDING 목록")
    @GetMapping("/edit-requests")
    @RequirePermission(page = "partners.edit-requests.decide", action = PermissionAction.VIEW)
    public ApiResponse<List<PartnerEditRequestResponse>> listForRole(
            @RequestParam(defaultValue = "MANAGER") EditTargetRole targetRole) {
        List<PartnerEditRequest> rows = editRequestService.listPendingForRole(targetRole);
        return ApiResponse.ok(rows.stream().map(PartnerEditRequestResponse::from).toList());
    }

    @Operation(summary = "entity 별 요청 이력")
    @GetMapping("/entities/{entityId}/edit-requests")
    @RequirePermission(page = "partners.edit-requests", action = PermissionAction.VIEW)
    public ApiResponse<List<PartnerEditRequestResponse>> listByEntity(
            @PathVariable UUID entityId) {
        List<PartnerEditRequest> rows = editRequestService.listByEntity(entityId);
        return ApiResponse.ok(rows.stream().map(PartnerEditRequestResponse::from).toList());
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
