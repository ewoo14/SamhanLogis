package com.samhanair.logis.slip.web.dispatch;

import com.samhanair.logis.collab.CollabCommentService;
import com.samhanair.logis.collab.CollabCommentRecord;
import com.samhanair.logis.collab.CollabDocumentType;
import com.samhanair.logis.collab.CollabSuggestionStatus;
import com.samhanair.logis.collab.coedit.CollabCoeditService;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.exception.ExceptionMessageSanitizer;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import com.samhanair.logis.shared.realtime.presence.PresenceEntry;
import com.samhanair.logis.shared.realtime.presence.PresenceService;
import com.samhanair.logis.slip.dispatch.collab.DispatchCollabComment;
import com.samhanair.logis.slip.dispatch.collab.DispatchCollabEditService;
import com.samhanair.logis.slip.dispatch.collab.DispatchCollabSuggestionRepository;
import com.samhanair.logis.slip.dispatch.collab.DispatchDocumentCollaborationPort;
import com.samhanair.logis.slip.repository.dispatch.DispatchTaskRepository;
import com.samhanair.logis.slip.web.dispatch.dto.AddDispatchCommentRequest;
import com.samhanair.logis.slip.web.dispatch.dto.CommitDispatchCollabEditRequest;
import com.samhanair.logis.slip.web.dispatch.dto.DispatchCoeditAwarenessRequest;
import com.samhanair.logis.slip.web.dispatch.dto.DispatchCoeditUpdateRequest;
import com.samhanair.logis.slip.web.dispatch.dto.DispatchCoeditUpdatesResponse;
import com.samhanair.logis.slip.web.dispatch.dto.DispatchCollabEditResponse;
import com.samhanair.logis.slip.web.dispatch.dto.DispatchCollabSuggestionResponse;
import com.samhanair.logis.slip.web.dispatch.dto.DispatchCommentResponse;
import com.samhanair.logis.slip.web.dispatch.dto.DispatchPresenceRequest;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
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
 * DispatchTask 협업 댓글/수정완료/presence REST/SSE endpoint.
 *
 * <p>shared/collab-core 의 {@link CollabCommentService} 를 배차 도메인에 연결하는 첫 reference.
 * arologis 전송/수정 요청 흐름과 분리된 협업 채널이다. presence 엔드포인트는 slip-service
 * SlipCollabController 와 동일 패턴을 배차(dispatch.board) page-code 로 재사용한다.
 */
@RestController
@RequestMapping("/admin/dispatch-tasks/{taskId}")
@Slf4j
public class DispatchCollabCommentController {

    private static final String CALLER_ID_HEADER = "X-User-Id";
    private static final String CALLER_NAME_HEADER = "X-User-Name";
    private final CollabCommentService<DispatchCollabComment> commentService;
    private final DispatchCollabEditService editService;
    private final DispatchCollabSuggestionRepository suggestionRepository;
    private final DispatchDocumentCollaborationPort port;
    private final RealtimeBroker broker;
    private final DispatchTaskRepository dispatchTaskRepository;
    private final PresenceService presenceService;
    private final CollabCoeditService coeditService;

    public DispatchCollabCommentController(
            CollabCommentService<DispatchCollabComment> commentService,
            DispatchCollabEditService editService,
            DispatchCollabSuggestionRepository suggestionRepository,
            DispatchDocumentCollaborationPort port,
            RealtimeBroker broker,
            DispatchTaskRepository dispatchTaskRepository,
            PresenceService presenceService,
            CollabCoeditService coeditService) {
        this.commentService = commentService;
        this.editService = editService;
        this.suggestionRepository = suggestionRepository;
        this.port = port;
        this.broker = broker;
        this.dispatchTaskRepository = dispatchTaskRepository;
        this.presenceService = presenceService;
        this.coeditService = coeditService;
    }

    /**
     * DispatchTask 댓글 등록.
     *
     * <p>등록 직후 {@code comment.created} SSE event 가 taskId 채널로 publish 된다.
     */
    @Operation(summary = "배차 협업 댓글 등록 + SSE push")
    @PostMapping("/comments")
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = "dispatch.board", action = PermissionAction.UPDATE)
    public ApiResponse<DispatchCommentResponse> add(
            @PathVariable UUID taskId,
            @Valid @RequestBody AddDispatchCommentRequest request,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        ensureTaskExists(taskId);
        DispatchCollabComment saved = commentService.add(
                CollabDocumentType.DISPATCH_TASK,
                taskId,
                request.anchor(),
                resolveAuthorId(callerId),
                resolveAuthorName(callerId, callerName),
                request.body(),
                request.parentId());
        return ApiResponse.ok(DispatchCommentResponse.from(saved));
    }

    /**
     * DispatchTask 최근 댓글 백필. SSE 구독 직전 초기 표시용이다.
     *
     * @param limit 1~100. 기본 20.
     */
    @Operation(summary = "배차 협업 최근 댓글 조회")
    @GetMapping("/comments")
    @RequirePermission(page = "dispatch.board", action = PermissionAction.VIEW)
    public ApiResponse<List<DispatchCommentResponse>> listRecent(
            @PathVariable UUID taskId,
            @RequestParam(defaultValue = "20") int limit) {
        ensureTaskExists(taskId);
        List<DispatchCommentResponse> items = commentService
                .listRecent(CollabDocumentType.DISPATCH_TASK, taskId, limit)
                .stream()
                .map(DispatchCommentResponse::from)
                .toList();
        return ApiResponse.ok(items);
    }

    /** DispatchTask 댓글 soft-delete. 물리 삭제는 수행하지 않는다. */
    @Operation(summary = "배차 협업 댓글 soft delete")
    @DeleteMapping("/comments/{commentId}")
    @RequirePermission(page = "dispatch.board", action = PermissionAction.UPDATE)
    public ApiResponse<Void> delete(
            @PathVariable UUID taskId,
            @PathVariable UUID commentId,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId) {
        ensureTaskExists(taskId);
        commentService.softDelete(
                CollabDocumentType.DISPATCH_TASK, taskId, commentId, resolveDeleter(callerId));
        return ApiResponse.ok(null);
    }

    /** DispatchTask 댓글 해결 처리. {@code comment.resolved} SSE event 가 publish 된다. */
    @Operation(summary = "배차 협업 댓글 해결 처리")
    @PostMapping("/comments/{commentId}/resolve")
    @RequirePermission(page = "dispatch.board", action = PermissionAction.UPDATE)
    public ApiResponse<DispatchCommentResponse> resolve(
            @PathVariable UUID taskId,
            @PathVariable UUID commentId) {
        ensureTaskExists(taskId);
        return ApiResponse.ok(DispatchCommentResponse.from(commentService.resolve(
                CollabDocumentType.DISPATCH_TASK, taskId, commentId)));
    }

    /** DispatchTask memo 수정완료. */
    @Operation(summary = "배차 협업 수정완료")
    @PostMapping("/edits")
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = "dispatch.board", action = PermissionAction.UPDATE)
    public ApiResponse<DispatchCollabEditResponse> commitEdit(
            @PathVariable UUID taskId,
            @Valid @RequestBody CommitDispatchCollabEditRequest request,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        ensureTaskExists(taskId);
        port.validateChangeSet(request.changeSet());
        DispatchCollabEditService.Result result = editService.commitEdit(
                port, taskId, resolveAuthorId(callerId), resolveAuthorName(callerId, callerName),
                request.changeSet(), request.reason());
        return ApiResponse.ok(new DispatchCollabEditResponse(
                DispatchCollabSuggestionResponse.from(result.edit()), result.task()));
    }

    /** DispatchTask 수정 이력 목록. */
    @Operation(summary = "배차 협업 수정 이력 목록")
    @GetMapping("/edits")
    @RequirePermission(page = "dispatch.board", action = PermissionAction.VIEW)
    public ApiResponse<List<DispatchCollabSuggestionResponse>> listEdits(@PathVariable UUID taskId) {
        ensureTaskExists(taskId);
        List<DispatchCollabSuggestionResponse> items = suggestionRepository
                .findByDocumentTypeAndDocumentIdAndStatusOrderByCreatedAtDesc(
                        CollabDocumentType.DISPATCH_TASK, taskId, CollabSuggestionStatus.ACCEPTED)
                .stream()
                .map(DispatchCollabSuggestionResponse::from)
                .toList();
        return ApiResponse.ok(items);
    }

    /** 배차 협업 메모 Yjs update 누적 snapshot. 서버는 update 내용을 해석하지 않는다. */
    @Operation(summary = "배차 협업 메모 coedit update snapshot")
    @GetMapping("/collab/coedit")
    @RequirePermission(page = "dispatch.board", action = PermissionAction.VIEW)
    public ApiResponse<DispatchCoeditUpdatesResponse> listCoeditUpdates(@PathVariable UUID taskId) {
        ensureTaskExists(taskId);
        return ApiResponse.ok(new DispatchCoeditUpdatesResponse(coeditService.listUpdates(taskId)));
    }

    /** 배차 협업 메모 Yjs update relay. 같은 collab SSE stream 으로 coedit:update 이벤트가 발행된다. */
    @Operation(summary = "배차 협업 메모 coedit update relay")
    @PostMapping("/collab/coedit/update")
    @RequirePermission(page = "dispatch.board", action = PermissionAction.UPDATE)
    public ApiResponse<Void> appendCoeditUpdate(
            @PathVariable UUID taskId,
            @RequestBody(required = false) DispatchCoeditUpdateRequest request) {
        ensureTaskExists(taskId);
        coeditService.appendUpdate(taskId, request == null ? null : request.update());
        return ApiResponse.ok(null);
    }

    /** 배차 협업 메모 cursor/selection relay. 저장하지 않는 ephemeral 이벤트다. */
    @Operation(summary = "배차 협업 메모 coedit awareness relay")
    @PostMapping("/collab/coedit/awareness")
    @RequirePermission(page = "dispatch.board", action = PermissionAction.VIEW)
    public ApiResponse<Void> publishCoeditAwareness(
            @PathVariable UUID taskId,
            @RequestBody(required = false) DispatchCoeditAwarenessRequest request) {
        ensureTaskExists(taskId);
        coeditService.publishAwareness(taskId, request == null ? null : request.awareness());
        return ApiResponse.ok(null);
    }

    /** DispatchTask 협업 SSE stream. 댓글/수정 이벤트는 taskId 채널로 전달된다. */
    @Operation(summary = "배차 협업 SSE stream 구독")
    @GetMapping(value = "/collab/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @RequirePermission(page = "dispatch.board", action = PermissionAction.VIEW)
    public SseEmitter stream(@PathVariable UUID taskId) {
        ensureTaskExists(taskId);
        return broker.subscribe(taskId);
    }

    private UUID resolveAuthorId(String header) {
        if (header == null || header.isBlank()) {
            return new UUID(0L, 0L);
        }
        try {
            return UUID.fromString(header);
        } catch (IllegalArgumentException ex) {
            return new UUID(0L, 0L);
        }
    }

    private String resolveAuthorName(String callerId, String callerName) {
        String normalized = callerName == null ? null : callerName.trim();
        String resolved = ActorDisplayName.resolve(callerId, normalized);
        if ("system".equals(resolved)) return resolved;
        normalized = resolved;
        return normalized.length() <= CollabCommentRecord.MAX_AUTHOR_NAME_LENGTH
                ? normalized
                : normalized.substring(0, CollabCommentRecord.MAX_AUTHOR_NAME_LENGTH);
    }

    private String resolveDeleter(String callerId) {
        return (callerId == null || callerId.isBlank()) ? "system" : callerId;
    }

    private void ensureTaskExists(UUID taskId) {
        if (!dispatchTaskRepository.existsByIdAndIsDeletedFalse(taskId)) {
            log.warn("[DispatchCollabCommentController] 배차 작업 미존재 — taskId={}", taskId);
            throw new BusinessException(ErrorCode.NOT_FOUND, "대상 배차 작업을 찾을 수 없습니다");
        }
    }

    // -----------------------------------------------------------------------
    // Presence 엔드포인트
    // -----------------------------------------------------------------------

    /**
     * 배차 협업 presence join/heartbeat.
     *
     * <p>신규 sessionId 는 기존 collab SSE stream 으로 {@code presence:join} 이벤트가 발행된다.
     * entityId 는 taskId(UUID) 를 그대로 사용하며 wire payload 에 userId/accountId 는 포함하지 않는다.
     */
    @Operation(summary = "배차 협업 presence join/heartbeat")
    @PostMapping("/collab/presence/join")
    @RequirePermission(page = "dispatch.board", action = PermissionAction.VIEW)
    public ApiResponse<PresenceEntry> joinPresence(
            @PathVariable UUID taskId,
            @RequestBody(required = false) DispatchPresenceRequest request,
            @RequestHeader(CALLER_ID_HEADER) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        ensureTaskExists(taskId);
        String userId = resolvePresenceUserId(callerId);
        String sessionId = resolvePresenceSessionId(request);
        String displayName = resolvePresenceDisplayName(callerName, request);
        return ApiResponse.ok(presenceService.join(taskId, sessionId, userId, displayName));
    }

    /**
     * 배차 협업 presence leave.
     *
     * <p>호출자가 session owner 일 때만 {@code presence:leave} 이벤트가 발행된다.
     */
    @Operation(summary = "배차 협업 presence leave")
    @PostMapping("/collab/presence/leave")
    @RequirePermission(page = "dispatch.board", action = PermissionAction.VIEW)
    public ApiResponse<Void> leavePresence(
            @PathVariable UUID taskId,
            @RequestBody(required = false) DispatchPresenceRequest request,
            @RequestHeader(CALLER_ID_HEADER) String callerId) {
        ensureTaskExists(taskId);
        String userId = resolvePresenceUserId(callerId);
        presenceService.leave(taskId, resolvePresenceSessionId(request), userId);
        return ApiResponse.ok(null);
    }

    /**
     * 배차 협업 현재 presence 목록.
     *
     * <p>account UUID 는 wire payload 에 포함하지 않는다 ({@link PresenceEntry#lastSeenAt} 은
     * {@code @JsonIgnore}). 반환 필드: sessionId / displayName / color 만.
     */
    @Operation(summary = "배차 협업 presence 목록")
    @GetMapping("/collab/presence")
    @RequirePermission(page = "dispatch.board", action = PermissionAction.VIEW)
    public ApiResponse<List<PresenceEntry>> listPresence(@PathVariable UUID taskId) {
        ensureTaskExists(taskId);
        return ApiResponse.ok(presenceService.list(taskId));
    }

    // -----------------------------------------------------------------------
    // Presence helper
    // -----------------------------------------------------------------------

    /**
     * X-User-Id 헤더에서 presence userId 를 추출한다. 빈 값이면 401 을 발생시킨다.
     */
    private String resolvePresenceUserId(String callerId) {
        String headerUserId = callerId == null ? null : callerId.trim();
        if (headerUserId != null && !headerUserId.isBlank()) {
            return headerUserId;
        }
        throw new BusinessException(ErrorCode.UNAUTHORIZED,
                "presence 사용자 정보를 확인할 수 없습니다");
    }

    /**
     * 요청 바디에서 sessionId 를 추출한다. 빈 값이면 400 을 발생시킨다.
     */
    private String resolvePresenceSessionId(DispatchPresenceRequest request) {
        String sessionId = request == null || request.sessionId() == null
                ? null
                : request.sessionId().trim();
        if (sessionId == null || sessionId.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "presence sessionId 는 필수입니다");
        }
        return sessionId;
    }

    /**
     * X-User-Name 헤더를 우선하고, 없으면 요청 바디의 displayName 을 사용한다.
     * UUID 형태 이름은 system 으로 변환하며 wire 에 포함하지 않기 위해 null 반환한다.
     */
    private String resolvePresenceDisplayName(String callerName, DispatchPresenceRequest request) {
        if (callerName != null && !callerName.isBlank()) {
            String resolved = resolveAuthorName(null, callerName);
            return "system".equals(resolved) ? null : resolved;
        }
        String resolved = request == null ? null : resolveAuthorName(null, request.displayName());
        return "system".equals(resolved) ? null : resolved;
    }

    // -----------------------------------------------------------------------
    // ExceptionHandler
    // -----------------------------------------------------------------------

    /**
     * X-User-Id 헤더 누락(required=true 설정) 시 401, 그 외 필수 헤더 누락 시 400 을 반환한다.
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
}
