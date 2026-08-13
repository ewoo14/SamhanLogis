package com.samhanair.logis.groupware.controller;

import com.samhanair.logis.collab.CollabCommentRecord;
import com.samhanair.logis.collab.CollabCommentService;
import com.samhanair.logis.collab.CollabDocumentType;
import com.samhanair.logis.collab.CollabSuggestionStatus;
import com.samhanair.logis.collab.coedit.CollabCoeditService;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.exception.ExceptionMessageSanitizer;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.groupware.collab.ApprovalCollabComment;
import com.samhanair.logis.groupware.collab.ApprovalCollabSuggestionRepository;
import com.samhanair.logis.groupware.collab.GroupwareApprovalCollabEditService;
import com.samhanair.logis.groupware.collab.GroupwareApprovalDocumentCollaborationPort;
import com.samhanair.logis.groupware.repository.ApprovalLineRepository;
import com.samhanair.logis.groupware.web.collab.dto.AddApprovalCollabCommentRequest;
import com.samhanair.logis.groupware.web.collab.dto.ApprovalCoeditAwarenessRequest;
import com.samhanair.logis.groupware.web.collab.dto.ApprovalCoeditUpdateRequest;
import com.samhanair.logis.groupware.web.collab.dto.ApprovalCoeditUpdatesResponse;
import com.samhanair.logis.groupware.web.collab.dto.ApprovalCollabCommentResponse;
import com.samhanair.logis.groupware.web.collab.dto.ApprovalCollabEditResponse;
import com.samhanair.logis.groupware.web.collab.dto.ApprovalCollabSuggestionResponse;
import com.samhanair.logis.groupware.web.collab.dto.ApprovalPresenceRequest;
import com.samhanair.logis.groupware.web.collab.dto.CommitApprovalCollabEditRequest;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import com.samhanair.logis.shared.realtime.presence.PresenceEntry;
import com.samhanair.logis.shared.realtime.presence.PresenceService;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 그룹웨어 결재 협업 REST/SSE endpoint.
 *
 * <p>댓글은 shared/collab-core generic service 를 사용하고, 수정은 1-인 수정완료 모델로
 * {@code approval_collab_suggestions} 를 ACCEPTED 수정 이력으로 재사용한다.
 */
@RestController
@RequestMapping("/admin/groupware/approvals/{approvalId}/collab")
public class GroupwareApprovalCollabController {

    public static final String PAGE_CODE = "groupware.approvals";

    private static final String CALLER_ID_HEADER = "X-User-Id";
    private static final String CALLER_NAME_HEADER = "X-User-Name";
    private final CollabCommentService<ApprovalCollabComment> commentService;
    private final GroupwareApprovalCollabEditService editService;
    private final ApprovalCollabSuggestionRepository suggestionRepository;
    private final GroupwareApprovalDocumentCollaborationPort port;
    private final RealtimeBroker broker;
    private final ApprovalLineRepository approvalLineRepository;
    private final PresenceService presenceService;
    private final CollabCoeditService coeditService;

    public GroupwareApprovalCollabController(
            @Qualifier("groupwareApprovalCollabCommentService")
            CollabCommentService<ApprovalCollabComment> commentService,
            GroupwareApprovalCollabEditService editService,
            ApprovalCollabSuggestionRepository suggestionRepository,
            GroupwareApprovalDocumentCollaborationPort port,
            RealtimeBroker broker,
            ApprovalLineRepository approvalLineRepository,
            PresenceService presenceService,
            CollabCoeditService coeditService) {
        this.commentService = commentService;
        this.editService = editService;
        this.suggestionRepository = suggestionRepository;
        this.port = port;
        this.broker = broker;
        this.approvalLineRepository = approvalLineRepository;
        this.presenceService = presenceService;
        this.coeditService = coeditService;
    }

    /** 결재 협업 댓글 등록. */
    @Operation(summary = "결재 협업 댓글 등록 + SSE push")
    @PostMapping("/comments")
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<ApprovalCollabCommentResponse> addComment(
            @PathVariable UUID approvalId,
            @Valid @RequestBody AddApprovalCollabCommentRequest request,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        ensureApprovalExists(approvalId);
        ApprovalCollabComment saved = commentService.add(
                CollabDocumentType.APPROVAL_LINE,
                approvalId,
                request.anchor(),
                resolveActorId(callerId),
                resolveActorName(callerName),
                request.body(),
                request.parentId());
        return ApiResponse.ok(ApprovalCollabCommentResponse.from(saved));
    }

    /** 결재 협업 최근 댓글 백필. */
    @Operation(summary = "결재 협업 최근 댓글 조회")
    @GetMapping("/comments")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<List<ApprovalCollabCommentResponse>> listComments(
            @PathVariable UUID approvalId,
            @RequestParam(defaultValue = "20") int limit) {
        ensureApprovalExists(approvalId);
        List<ApprovalCollabCommentResponse> items = commentService
                .listRecent(CollabDocumentType.APPROVAL_LINE, approvalId, limit)
                .stream()
                .map(ApprovalCollabCommentResponse::from)
                .toList();
        return ApiResponse.ok(items);
    }

    /** 결재 협업 댓글 soft-delete. */
    @Operation(summary = "결재 협업 댓글 soft delete")
    @DeleteMapping("/comments/{commentId}")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<Void> deleteComment(
            @PathVariable UUID approvalId,
            @PathVariable UUID commentId,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId) {
        ensureApprovalExists(approvalId);
        commentService.softDelete(
                CollabDocumentType.APPROVAL_LINE, approvalId, commentId, resolveDeleter(callerId));
        return ApiResponse.ok(null);
    }

    /** 결재 협업 댓글 해결 처리. */
    @Operation(summary = "결재 협업 댓글 해결 처리")
    @PostMapping("/comments/{commentId}/resolve")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<ApprovalCollabCommentResponse> resolveComment(
            @PathVariable UUID approvalId,
            @PathVariable UUID commentId) {
        ensureApprovalExists(approvalId);
        return ApiResponse.ok(ApprovalCollabCommentResponse.from(
                commentService.resolve(CollabDocumentType.APPROVAL_LINE, approvalId, commentId)));
    }

    /** 결재 title/content 수정완료. */
    @Operation(summary = "결재 협업 수정완료")
    @PostMapping("/edits")
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<ApprovalCollabEditResponse> commitEdit(
            @PathVariable UUID approvalId,
            @Valid @RequestBody CommitApprovalCollabEditRequest request,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        ensureApprovalExists(approvalId);
        port.validateChangeSet(request.changeSet());
        GroupwareApprovalCollabEditService.Result result = editService.commitEdit(
                port, approvalId, resolveActorId(callerId), resolveActorName(callerName),
                request.changeSet(), request.reason());
        return ApiResponse.ok(new ApprovalCollabEditResponse(
                ApprovalCollabSuggestionResponse.from(result.edit()), result.approval()));
    }

    /** 결재 수정 이력 목록. */
    @Operation(summary = "결재 협업 수정 이력 목록")
    @GetMapping("/edits")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<List<ApprovalCollabSuggestionResponse>> listEdits(@PathVariable UUID approvalId) {
        ensureApprovalExists(approvalId);
        List<ApprovalCollabSuggestionResponse> items = suggestionRepository
                .findByDocumentTypeAndDocumentIdAndStatusOrderByCreatedAtDesc(
                        CollabDocumentType.APPROVAL_LINE, approvalId, CollabSuggestionStatus.ACCEPTED)
                .stream()
                .map(ApprovalCollabSuggestionResponse::from)
                .toList();
        return ApiResponse.ok(items);
    }

    /** 결재 협업 메모 Yjs update 누적 snapshot. 서버는 update 내용을 해석하지 않는다. */
    @Operation(summary = "결재 협업 메모 coedit update snapshot")
    @GetMapping("/coedit")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<ApprovalCoeditUpdatesResponse> listCoeditUpdates(@PathVariable UUID approvalId) {
        ensureApprovalExists(approvalId);
        return ApiResponse.ok(new ApprovalCoeditUpdatesResponse(coeditService.listUpdates(approvalId)));
    }

    /** 결재 협업 메모 Yjs update relay. 같은 collab SSE stream 으로 coedit:update 이벤트가 발행된다. */
    @Operation(summary = "결재 협업 메모 coedit update relay")
    @PostMapping("/coedit/update")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<Void> appendCoeditUpdate(
            @PathVariable UUID approvalId,
            @RequestBody(required = false) ApprovalCoeditUpdateRequest request) {
        ensureApprovalExists(approvalId);
        coeditService.appendUpdate(approvalId, request == null ? null : request.update());
        return ApiResponse.ok(null);
    }

    /** 결재 협업 메모 cursor/selection relay. 저장하지 않는 ephemeral 이벤트다. */
    @Operation(summary = "결재 협업 메모 coedit awareness relay")
    @PostMapping("/coedit/awareness")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<Void> publishCoeditAwareness(
            @PathVariable UUID approvalId,
            @RequestBody(required = false) ApprovalCoeditAwarenessRequest request) {
        ensureApprovalExists(approvalId);
        coeditService.publishAwareness(approvalId, request == null ? null : request.awareness());
        return ApiResponse.ok(null);
    }

    /** 결재 협업 SSE stream. 댓글/수정 이벤트는 approvalId 채널로 전달된다. */
    @Operation(summary = "결재 협업 SSE stream 구독")
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    public SseEmitter stream(@PathVariable UUID approvalId) {
        ensureApprovalExists(approvalId);
        return broker.subscribe(approvalId);
    }

    /** 결재 협업 presence join/heartbeat. 신규 sessionId 는 기존 collab SSE stream 으로 presence:join 이벤트가 발행된다. */
    @Operation(summary = "결재 협업 presence join/heartbeat")
    @PostMapping("/presence/join")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<PresenceEntry> joinPresence(
            @PathVariable UUID approvalId,
            @RequestBody(required = false) ApprovalPresenceRequest request,
            @RequestHeader(CALLER_ID_HEADER) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        ensureApprovalExists(approvalId);
        String userId = resolvePresenceUserId(callerId);
        String sessionId = resolvePresenceSessionId(request);
        String displayName = resolvePresenceDisplayName(callerName, request);
        return ApiResponse.ok(presenceService.join(approvalId, sessionId, userId, displayName));
    }

    /** 결재 협업 presence leave. 호출자가 session owner 일 때만 presence:leave 이벤트가 발행된다. */
    @Operation(summary = "결재 협업 presence leave")
    @PostMapping("/presence/leave")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<Void> leavePresence(
            @PathVariable UUID approvalId,
            @RequestBody(required = false) ApprovalPresenceRequest request,
            @RequestHeader(CALLER_ID_HEADER) String callerId) {
        ensureApprovalExists(approvalId);
        String userId = resolvePresenceUserId(callerId);
        presenceService.leave(approvalId, resolvePresenceSessionId(request), userId);
        return ApiResponse.ok(null);
    }

    /** 결재 협업 현재 presence 목록. account UUID 는 wire payload 에 포함하지 않는다. */
    @Operation(summary = "결재 협업 presence 목록")
    @GetMapping("/presence")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<List<PresenceEntry>> listPresence(@PathVariable UUID approvalId) {
        ensureApprovalExists(approvalId);
        return ApiResponse.ok(presenceService.list(approvalId));
    }

    private void ensureApprovalExists(UUID approvalId) {
        if (!approvalLineRepository.existsById(approvalId)) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "대상 결재 문서를 찾을 수 없습니다");
        }
    }

    private String resolvePresenceUserId(String callerId) {
        String headerUserId = callerId == null ? null : callerId.trim();
        if (headerUserId != null && !headerUserId.isBlank()) {
            return headerUserId;
        }
        throw new BusinessException(ErrorCode.UNAUTHORIZED,
                "presence 사용자 정보를 확인할 수 없습니다");
    }

    private String resolvePresenceSessionId(ApprovalPresenceRequest request) {
        String sessionId = request == null || request.sessionId() == null
                ? null
                : request.sessionId().trim();
        if (sessionId == null || sessionId.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "presence sessionId 는 필수입니다");
        }
        return sessionId;
    }

    private String resolvePresenceDisplayName(String callerName, ApprovalPresenceRequest request) {
        if (callerName != null && !callerName.isBlank()) {
            String resolved = resolveActorName(callerName);
            return "system".equals(resolved) ? null : resolved;
        }
        String resolved = request == null ? null : resolveActorName(request.displayName());
        return "system".equals(resolved) ? null : resolved;
    }

    /**
     * {@code X-User-Id} 헤더 누락 시 presence 엔드포인트는 401 로 응답한다.
     * 그 외 필수 헤더 누락은 400 으로 응답한다.
     */
    @ExceptionHandler(MissingRequestHeaderException.class)
    public ResponseEntity<ApiResponse<Void>> handleMissingHeader(MissingRequestHeaderException ex) {
        if (CALLER_ID_HEADER.equalsIgnoreCase(ex.getHeaderName())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.fail(ErrorCode.UNAUTHORIZED,
                            "presence 사용자 정보를 확인할 수 없습니다"));
        }
        return ResponseEntity.status(ErrorCode.INVALID_INPUT.getHttpStatus())
                .body(ApiResponse.fail(ErrorCode.INVALID_INPUT,
                        ExceptionMessageSanitizer.sanitize(ex.getMessage())));
    }

    private UUID resolveActorId(String header) {
        if (header == null || header.isBlank()) {
            return new UUID(0L, 0L);
        }
        try {
            return UUID.fromString(header);
        } catch (IllegalArgumentException ex) {
            return new UUID(0L, 0L);
        }
    }

    private String resolveActorName(String callerName) {
        String normalized = callerName == null ? null : callerName.trim();
        String resolved = ActorDisplayName.resolve(null, normalized);
        if ("system".equals(resolved)) return resolved;
        normalized = resolved;
        return normalized.length() <= CollabCommentRecord.MAX_AUTHOR_NAME_LENGTH
                ? normalized
                : normalized.substring(0, CollabCommentRecord.MAX_AUTHOR_NAME_LENGTH);
    }

    private String resolveDeleter(String callerId) {
        return (callerId == null || callerId.isBlank()) ? "system" : callerId;
    }
}
