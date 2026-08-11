package com.samhanair.logis.slip.estimate.web.collab;

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
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import com.samhanair.logis.shared.realtime.presence.PresenceEntry;
import com.samhanair.logis.shared.realtime.presence.PresenceService;
import com.samhanair.logis.slip.estimate.collab.EstimateCollabComment;
import com.samhanair.logis.slip.estimate.collab.EstimateCollabEditService;
import com.samhanair.logis.slip.estimate.collab.EstimateCollabSuggestionRepository;
import com.samhanair.logis.slip.estimate.collab.EstimateDocumentCollaborationPort;
import com.samhanair.logis.slip.estimate.repository.EstimateRepository;
import com.samhanair.logis.slip.estimate.web.EstimatePermissionGuard;
import com.samhanair.logis.slip.estimate.web.collab.dto.AddEstimateCollabCommentRequest;
import com.samhanair.logis.slip.estimate.web.collab.dto.CommitEstimateCollabEditRequest;
import com.samhanair.logis.slip.estimate.web.collab.dto.EstimateCoeditAwarenessRequest;
import com.samhanair.logis.slip.estimate.web.collab.dto.EstimateCoeditUpdateRequest;
import com.samhanair.logis.slip.estimate.web.collab.dto.EstimateCoeditUpdatesResponse;
import com.samhanair.logis.slip.estimate.web.collab.dto.EstimateCollabCommentResponse;
import com.samhanair.logis.slip.estimate.web.collab.dto.EstimateCollabEditResponse;
import com.samhanair.logis.slip.estimate.web.collab.dto.EstimateCollabSuggestionResponse;
import com.samhanair.logis.slip.estimate.web.collab.dto.EstimatePresenceRequest;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
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
 * 견적 협업 REST/SSE endpoint.
 *
 * <p>댓글은 shared/collab-core generic service 를 사용하고, 수정은 1-인 수정완료 모델로
 * {@code estimate_collab_suggestions} 를 ACCEPTED 수정 이력으로 재사용한다.
 */
@RestController
@RequestMapping("/slips/estimates")
public class EstimateCollabController {

    private static final String CALLER_ID_HEADER = "X-User-Id";
    private static final String CALLER_NAME_HEADER = "X-User-Name";
    private final CollabCommentService<EstimateCollabComment> commentService;
    private final EstimateCollabEditService editService;
    private final EstimateCollabSuggestionRepository suggestionRepository;
    private final EstimateDocumentCollaborationPort port;
    private final RealtimeBroker broker;
    private final EstimateRepository estimateRepository;
    private final PresenceService presenceService;
    private final CollabCoeditService coeditService;

    public EstimateCollabController(CollabCommentService<EstimateCollabComment> commentService,
                                    EstimateCollabEditService editService,
                                    EstimateCollabSuggestionRepository suggestionRepository,
                                    EstimateDocumentCollaborationPort port,
                                    RealtimeBroker broker,
                                    EstimateRepository estimateRepository,
                                    PresenceService presenceService,
                                    CollabCoeditService coeditService) {
        this.commentService = commentService;
        this.editService = editService;
        this.suggestionRepository = suggestionRepository;
        this.port = port;
        this.broker = broker;
        this.estimateRepository = estimateRepository;
        this.presenceService = presenceService;
        this.coeditService = coeditService;
    }

    /** 견적 협업 댓글 등록. */
    @Operation(summary = "견적 협업 댓글 등록 + SSE push")
    @PostMapping("/{estimateId}/collab/comments")
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = EstimatePermissionGuard.PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<EstimateCollabCommentResponse> addComment(
            @PathVariable UUID estimateId,
            @Valid @RequestBody AddEstimateCollabCommentRequest request,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        ensureEstimateExists(estimateId);
        EstimateCollabComment saved = commentService.add(
                CollabDocumentType.ESTIMATE,
                estimateId,
                request.anchor(),
                resolveActorId(callerId),
                resolveActorName(callerName),
                request.body(),
                request.parentId());
        return ApiResponse.ok(EstimateCollabCommentResponse.from(saved));
    }

    /** 견적 협업 최근 댓글 백필. */
    @Operation(summary = "견적 협업 최근 댓글 조회")
    @GetMapping("/{estimateId}/collab/comments")
    @RequirePermission(page = EstimatePermissionGuard.PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<List<EstimateCollabCommentResponse>> listComments(
            @PathVariable UUID estimateId,
            @RequestParam(defaultValue = "20") int limit) {
        ensureEstimateExists(estimateId);
        List<EstimateCollabCommentResponse> items = commentService
                .listRecent(CollabDocumentType.ESTIMATE, estimateId, limit)
                .stream()
                .map(EstimateCollabCommentResponse::from)
                .toList();
        return ApiResponse.ok(items);
    }

    /** 견적 협업 댓글 soft-delete. */
    @Operation(summary = "견적 협업 댓글 soft delete")
    @DeleteMapping("/{estimateId}/collab/comments/{commentId}")
    @RequirePermission(page = EstimatePermissionGuard.PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<Void> deleteComment(
            @PathVariable UUID estimateId,
            @PathVariable UUID commentId,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId) {
        ensureEstimateExists(estimateId);
        commentService.softDelete(
                CollabDocumentType.ESTIMATE, estimateId, commentId, resolveDeleter(callerId));
        return ApiResponse.ok(null);
    }

    /** 견적 협업 댓글 해결 처리. */
    @Operation(summary = "견적 협업 댓글 해결 처리")
    @PostMapping("/{estimateId}/collab/comments/{commentId}/resolve")
    @RequirePermission(page = EstimatePermissionGuard.PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<EstimateCollabCommentResponse> resolveComment(
            @PathVariable UUID estimateId,
            @PathVariable UUID commentId) {
        ensureEstimateExists(estimateId);
        return ApiResponse.ok(EstimateCollabCommentResponse.from(
                commentService.resolve(CollabDocumentType.ESTIMATE, estimateId, commentId)));
    }

    /** 견적 수정완료. */
    @Operation(summary = "견적 협업 수정완료")
    @PostMapping("/{estimateId}/collab/edits")
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = EstimatePermissionGuard.PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<EstimateCollabEditResponse> commitEdit(
            @PathVariable UUID estimateId,
            @Valid @RequestBody CommitEstimateCollabEditRequest request,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        ensureEstimateExists(estimateId);
        port.validateChangeSet(request.changeSet());
        EstimateCollabEditService.Result result = editService.commitEdit(
                port, estimateId, resolveActorId(callerId), resolveActorName(callerName),
                request.changeSet(), request.reason());
        return ApiResponse.ok(new EstimateCollabEditResponse(
                EstimateCollabSuggestionResponse.from(result.edit()), result.estimate()));
    }

    /** 견적 수정 이력 목록. */
    @Operation(summary = "견적 협업 수정 이력 목록")
    @GetMapping("/{estimateId}/collab/edits")
    @RequirePermission(page = EstimatePermissionGuard.PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<List<EstimateCollabSuggestionResponse>> listEdits(
            @PathVariable UUID estimateId) {
        ensureEstimateExists(estimateId);
        List<EstimateCollabSuggestionResponse> items = suggestionRepository
                .findByDocumentTypeAndDocumentIdAndStatusOrderByCreatedAtDesc(
                        CollabDocumentType.ESTIMATE, estimateId, CollabSuggestionStatus.ACCEPTED)
                .stream()
                .map(EstimateCollabSuggestionResponse::from)
                .toList();
        return ApiResponse.ok(items);
    }

    /** 견적 협업 메모 Yjs update 누적 snapshot. 서버는 update 내용을 해석하지 않는다. */
    @Operation(summary = "견적 협업 메모 coedit update snapshot")
    @GetMapping("/{estimateId}/collab/coedit")
    @RequirePermission(page = EstimatePermissionGuard.PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<EstimateCoeditUpdatesResponse> listCoeditUpdates(
            @PathVariable UUID estimateId) {
        ensureEstimateExists(estimateId);
        return ApiResponse.ok(new EstimateCoeditUpdatesResponse(coeditService.listUpdates(estimateId)));
    }

    /** 견적 협업 메모 Yjs update relay. 같은 collab SSE stream 으로 coedit:update 이벤트가 발행된다. */
    @Operation(summary = "견적 협업 메모 coedit update relay")
    @PostMapping("/{estimateId}/collab/coedit/update")
    @RequirePermission(page = EstimatePermissionGuard.PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<Void> appendCoeditUpdate(
            @PathVariable UUID estimateId,
            @RequestBody(required = false) EstimateCoeditUpdateRequest request) {
        ensureEstimateExists(estimateId);
        coeditService.appendUpdate(estimateId, request == null ? null : request.update());
        return ApiResponse.ok(null);
    }

    /** 견적 협업 메모 cursor/selection relay. 저장하지 않는 ephemeral 이벤트다. */
    @Operation(summary = "견적 협업 메모 coedit awareness relay")
    @PostMapping("/{estimateId}/collab/coedit/awareness")
    @RequirePermission(page = EstimatePermissionGuard.PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<Void> publishCoeditAwareness(
            @PathVariable UUID estimateId,
            @RequestBody(required = false) EstimateCoeditAwarenessRequest request) {
        ensureEstimateExists(estimateId);
        coeditService.publishAwareness(estimateId, request == null ? null : request.awareness());
        return ApiResponse.ok(null);
    }

    /** 견적 협업 SSE stream. 댓글/수정 이벤트는 estimateId 채널로 전달된다. */
    @Operation(summary = "견적 협업 SSE stream 구독")
    @GetMapping(value = "/{estimateId}/collab/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @RequirePermission(page = EstimatePermissionGuard.PAGE_CODE, action = PermissionAction.VIEW)
    public SseEmitter stream(@PathVariable UUID estimateId) {
        ensureEstimateExists(estimateId);
        return broker.subscribe(estimateId);
    }

    /**
     * 견적 협업 presence join/heartbeat.
     *
     * <p>신규 sessionId 의 경우 기존 collab SSE stream 으로 {@code presence:join} 이벤트가 발행된다.
     * {@code X-User-Id} 헤더는 presence userId 로 필수이며, 없으면 401 을 반환한다.
     * 조회 권한은 {@link RequirePermission} 단일 가드로 적용된다.
     */
    @Operation(summary = "견적 협업 presence join/heartbeat")
    @PostMapping("/{estimateId}/collab/presence/join")
    @RequirePermission(page = EstimatePermissionGuard.PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<PresenceEntry> joinPresence(
            @PathVariable UUID estimateId,
            @RequestBody(required = false) EstimatePresenceRequest request,
            @RequestHeader(CALLER_ID_HEADER) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        ensureEstimateExists(estimateId);
        String userId = resolvePresenceUserId(callerId);
        String sessionId = resolvePresenceSessionId(request);
        String displayName = resolvePresenceDisplayName(callerName, request);
        return ApiResponse.ok(presenceService.join(estimateId, sessionId, userId, displayName));
    }

    /**
     * 견적 협업 presence leave.
     *
     * <p>호출자가 session owner 일 때만 {@code presence:leave} 이벤트가 발행된다.
     * {@code X-User-Id} 헤더는 필수이며, 없으면 401 을 반환한다.
     */
    @Operation(summary = "견적 협업 presence leave")
    @PostMapping("/{estimateId}/collab/presence/leave")
    @RequirePermission(page = EstimatePermissionGuard.PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<Void> leavePresence(
            @PathVariable UUID estimateId,
            @RequestBody(required = false) EstimatePresenceRequest request,
            @RequestHeader(CALLER_ID_HEADER) String callerId) {
        ensureEstimateExists(estimateId);
        String userId = resolvePresenceUserId(callerId);
        presenceService.leave(estimateId, resolvePresenceSessionId(request), userId);
        return ApiResponse.ok(null);
    }

    /**
     * 견적 협업 현재 presence 목록.
     *
     * <p>account UUID 는 wire payload 에 포함하지 않는다({@link PresenceEntry#lastSeenAt()} 은
     * {@code @JsonIgnore} 처리됨). VIEW 권한이 없으면 403 을 반환한다.
     */
    @Operation(summary = "견적 협업 presence 목록")
    @GetMapping("/{estimateId}/collab/presence")
    @RequirePermission(page = EstimatePermissionGuard.PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<List<PresenceEntry>> listPresence(@PathVariable UUID estimateId) {
        ensureEstimateExists(estimateId);
        return ApiResponse.ok(presenceService.list(estimateId));
    }

    private void ensureEstimateExists(UUID estimateId) {
        if (!estimateRepository.existsById(estimateId)) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "대상 견적을 찾을 수 없습니다");
        }
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

    /**
     * presence 엔드포인트 전용 userId 해석.
     *
     * <p>가드용 {@link #parseAccountIdOrNull} 과 달리 null/공백이면 즉시 401 예외를 던진다.
     * presence 는 반드시 식별된 사용자여야 한다.
     */
    private String resolvePresenceUserId(String callerId) {
        String trimmed = callerId == null ? null : callerId.trim();
        if (trimmed != null && !trimmed.isBlank()) {
            return trimmed;
        }
        throw new BusinessException(ErrorCode.UNAUTHORIZED, "presence 사용자 정보를 확인할 수 없습니다");
    }

    /**
     * presence 요청 body 에서 sessionId 를 추출한다.
     *
     * <p>sessionId 가 null/공백이면 400 예외를 던진다.
     */
    private String resolvePresenceSessionId(EstimatePresenceRequest request) {
        String sessionId = request == null || request.sessionId() == null
                ? null
                : request.sessionId().trim();
        if (sessionId == null || sessionId.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "presence sessionId 는 필수입니다");
        }
        return sessionId;
    }

    /**
     * X-User-Name 헤더 우선, 없으면 body displayName 을 사용한다.
     *
     * <p>헤더가 UUID 형태이거나 공백이면 body 로 fallback 하거나 null 을 반환한다.
     * null 은 {@link PresenceService} 가 기본 표시명으로 대체한다.
     */
    private String resolvePresenceDisplayName(String callerName, EstimatePresenceRequest request) {
        if (callerName != null && !callerName.isBlank()) {
            String resolved = resolveActorName(callerName);
            return "system".equals(resolved) ? null : resolved;
        }
        String resolved = request == null ? null : resolveActorName(request.displayName());
        return "system".equals(resolved) ? null : resolved;
    }

    /**
     * {@code X-User-Id} 헤더 누락 시 401 응답 처리.
     *
     * <p>presence join/leave 는 해당 헤더를 {@code required = true} 로 선언하므로
     * 헤더 누락 시 Spring 이 {@link MissingRequestHeaderException} 을 던진다.
     * 이를 UNAUTHORIZED 로 매핑한다.
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
