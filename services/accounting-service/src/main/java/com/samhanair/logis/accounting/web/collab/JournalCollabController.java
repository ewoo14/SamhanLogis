package com.samhanair.logis.accounting.web.collab;

import com.samhanair.logis.accounting.collab.JournalCollabComment;
import com.samhanair.logis.accounting.collab.JournalCollabEditService;
import com.samhanair.logis.accounting.collab.JournalCollabSuggestionRepository;
import com.samhanair.logis.accounting.collab.JournalDocumentCollaborationPort;
import com.samhanair.logis.accounting.web.collab.dto.AddJournalCollabCommentRequest;
import com.samhanair.logis.accounting.web.collab.dto.CommitJournalCollabEditRequest;
import com.samhanair.logis.accounting.web.collab.dto.JournalCoeditAwarenessRequest;
import com.samhanair.logis.accounting.web.collab.dto.JournalCoeditUpdateRequest;
import com.samhanair.logis.accounting.web.collab.dto.JournalCoeditUpdatesResponse;
import com.samhanair.logis.accounting.web.collab.dto.JournalCollabCommentResponse;
import com.samhanair.logis.accounting.web.collab.dto.JournalCollabEditResponse;
import com.samhanair.logis.accounting.web.collab.dto.JournalCollabSuggestionResponse;
import com.samhanair.logis.accounting.web.collab.dto.JournalPresenceRequest;
import com.samhanair.logis.accounting.web.dto.OpaqueUuidDeserializer;
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
 * 회계전표 협업 REST/SSE endpoint.
 *
 * <p>댓글은 shared/collab-core generic service 를 사용하고, 수정은 1-인 수정완료 모델로
 * {@code journal_collab_suggestions} 를 ACCEPTED 수정 이력으로 재사용한다.
 */
@RestController
@RequestMapping("/accounting/journals/{journalId}/collab")
public class JournalCollabController {

    private static final String CALLER_ID_HEADER = "X-User-Id";
    private static final String CALLER_NAME_HEADER = "X-User-Name";
    private static final String JOURNAL_PAGE_CODE = "accounting.journals";
    private final CollabCommentService<JournalCollabComment> commentService;
    private final JournalCollabEditService editService;
    private final JournalCollabSuggestionRepository suggestionRepository;
    private final JournalDocumentCollaborationPort port;
    private final RealtimeBroker broker;
    private final PresenceService presenceService;
    private final CollabCoeditService coeditService;

    public JournalCollabController(CollabCommentService<JournalCollabComment> commentService,
                                   JournalCollabEditService editService,
                                   JournalCollabSuggestionRepository suggestionRepository,
                                   JournalDocumentCollaborationPort port,
                                   RealtimeBroker broker,
                                   PresenceService presenceService,
                                   CollabCoeditService coeditService) {
        this.commentService = commentService;
        this.editService = editService;
        this.suggestionRepository = suggestionRepository;
        this.port = port;
        this.broker = broker;
        this.presenceService = presenceService;
        this.coeditService = coeditService;
    }

    /** 회계전표 협업 댓글 등록. */
    @Operation(summary = "회계전표 협업 댓글 등록 + SSE push")
    @PostMapping("/comments")
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = JOURNAL_PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<JournalCollabCommentResponse> addComment(
            @PathVariable("journalId") String journalIdToken,
            @Valid @RequestBody AddJournalCollabCommentRequest request,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        UUID journalId = decodeJournalId(journalIdToken);
        ensureJournalExists(journalId);
        JournalCollabComment saved = commentService.add(
                CollabDocumentType.ACCOUNTING_VOUCHER,
                journalId,
                request.anchor(),
                resolveActorId(callerId),
                resolveActorName(callerName),
                request.body(),
                request.parentId());
        return ApiResponse.ok(JournalCollabCommentResponse.from(saved));
    }

    /** 회계전표 협업 최근 댓글 백필. */
    @Operation(summary = "회계전표 협업 최근 댓글 조회")
    @GetMapping("/comments")
    @RequirePermission(page = JOURNAL_PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<List<JournalCollabCommentResponse>> listComments(
            @PathVariable("journalId") String journalIdToken,
            @RequestParam(defaultValue = "20") int limit) {
        UUID journalId = decodeJournalId(journalIdToken);
        ensureJournalExists(journalId);
        List<JournalCollabCommentResponse> items = commentService
                .listRecent(CollabDocumentType.ACCOUNTING_VOUCHER, journalId, limit)
                .stream()
                .map(JournalCollabCommentResponse::from)
                .toList();
        return ApiResponse.ok(items);
    }

    /** 회계전표 협업 댓글 soft-delete. */
    @Operation(summary = "회계전표 협업 댓글 soft delete")
    @DeleteMapping("/comments/{commentId}")
    @RequirePermission(page = JOURNAL_PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<Void> deleteComment(
            @PathVariable("journalId") String journalIdToken,
            @PathVariable UUID commentId,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId) {
        UUID journalId = decodeJournalId(journalIdToken);
        ensureJournalExists(journalId);
        commentService.softDelete(
                CollabDocumentType.ACCOUNTING_VOUCHER, journalId, commentId, resolveDeleter(callerId));
        return ApiResponse.ok(null);
    }

    /** 회계전표 협업 댓글 해결 처리. */
    @Operation(summary = "회계전표 협업 댓글 해결 처리")
    @PostMapping("/comments/{commentId}/resolve")
    @RequirePermission(page = JOURNAL_PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<JournalCollabCommentResponse> resolveComment(
            @PathVariable("journalId") String journalIdToken,
            @PathVariable UUID commentId) {
        UUID journalId = decodeJournalId(journalIdToken);
        ensureJournalExists(journalId);
        return ApiResponse.ok(JournalCollabCommentResponse.from(
                commentService.resolve(CollabDocumentType.ACCOUNTING_VOUCHER, journalId, commentId)));
    }

    /** 회계전표 수정완료. */
    @Operation(summary = "회계전표 협업 수정완료")
    @PostMapping("/edits")
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = JOURNAL_PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<JournalCollabEditResponse> commitEdit(
            @PathVariable("journalId") String journalIdToken,
            @Valid @RequestBody CommitJournalCollabEditRequest request,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        UUID journalId = decodeJournalId(journalIdToken);
        ensureJournalExists(journalId);
        port.validateChangeSet(request.changeSet());
        JournalCollabEditService.Result result = editService.commitEdit(
                port, journalId, resolveActorId(callerId), resolveActorName(callerName),
                request.changeSet(), request.reason());
        return ApiResponse.ok(new JournalCollabEditResponse(
                JournalCollabSuggestionResponse.from(result.edit()), result.journal()));
    }

    /** 회계전표 수정 이력 목록. */
    @Operation(summary = "회계전표 협업 수정 이력 목록")
    @GetMapping("/edits")
    @RequirePermission(page = JOURNAL_PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<List<JournalCollabSuggestionResponse>> listEdits(
            @PathVariable("journalId") String journalIdToken) {
        UUID journalId = decodeJournalId(journalIdToken);
        ensureJournalExists(journalId);
        List<JournalCollabSuggestionResponse> items = suggestionRepository
                .findByDocumentTypeAndDocumentIdAndStatusOrderByCreatedAtDesc(
                        CollabDocumentType.ACCOUNTING_VOUCHER, journalId, CollabSuggestionStatus.ACCEPTED)
                .stream()
                .map(JournalCollabSuggestionResponse::from)
                .toList();
        return ApiResponse.ok(items);
    }

    /** 회계전표 협업 메모 Yjs update 누적 snapshot. 서버는 update 내용을 해석하지 않는다. */
    @Operation(summary = "회계전표 협업 메모 coedit update snapshot")
    @GetMapping("/coedit")
    @RequirePermission(page = JOURNAL_PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<JournalCoeditUpdatesResponse> listCoeditUpdates(
            @PathVariable("journalId") String journalIdToken) {
        UUID journalId = decodeJournalId(journalIdToken);
        ensureJournalExists(journalId);
        return ApiResponse.ok(new JournalCoeditUpdatesResponse(coeditService.listUpdates(journalId)));
    }

    /** 회계전표 협업 메모 Yjs update relay. 같은 collab SSE stream 으로 coedit:update 이벤트가 발행된다. */
    @Operation(summary = "회계전표 협업 메모 coedit update relay")
    @PostMapping("/coedit/update")
    @RequirePermission(page = JOURNAL_PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<Void> appendCoeditUpdate(
            @PathVariable("journalId") String journalIdToken,
            @RequestBody(required = false) JournalCoeditUpdateRequest request) {
        UUID journalId = decodeJournalId(journalIdToken);
        ensureJournalExists(journalId);
        coeditService.appendUpdate(journalId, request == null ? null : request.update());
        return ApiResponse.ok(null);
    }

    /** 회계전표 협업 메모 cursor/selection relay. 저장하지 않는 ephemeral 이벤트다. */
    @Operation(summary = "회계전표 협업 메모 coedit awareness relay")
    @PostMapping("/coedit/awareness")
    @RequirePermission(page = JOURNAL_PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<Void> publishCoeditAwareness(
            @PathVariable("journalId") String journalIdToken,
            @RequestBody(required = false) JournalCoeditAwarenessRequest request) {
        UUID journalId = decodeJournalId(journalIdToken);
        ensureJournalExists(journalId);
        coeditService.publishAwareness(journalId, request == null ? null : request.awareness());
        return ApiResponse.ok(null);
    }

    /** 회계전표 협업 SSE stream. 댓글/수정 이벤트는 journalId 채널로 전달된다. */
    @Operation(summary = "회계전표 협업 SSE stream 구독")
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @RequirePermission(page = JOURNAL_PAGE_CODE, action = PermissionAction.VIEW)
    public SseEmitter stream(@PathVariable("journalId") String journalIdToken) {
        UUID journalId = decodeJournalId(journalIdToken);
        ensureJournalExists(journalId);
        return broker.subscribe(journalId);
    }

    /**
     * 회계전표 협업 presence join/heartbeat.
     *
     * <p>신규 {@code sessionId} 는 기존 collab SSE stream 으로 {@code presence:join} 이벤트가 발행된다.
     * {@code X-User-Name} 헤더가 있으면 body 의 {@code displayName} 보다 우선한다.
     */
    @Operation(summary = "회계전표 협업 presence join/heartbeat")
    @PostMapping("/presence/join")
    @RequirePermission(page = JOURNAL_PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<PresenceEntry> joinPresence(
            @PathVariable("journalId") String journalIdToken,
            @RequestBody(required = false) JournalPresenceRequest request,
            @RequestHeader(CALLER_ID_HEADER) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        UUID journalId = decodeJournalId(journalIdToken);
        ensureJournalExists(journalId);
        String userId = resolvePresenceUserId(callerId);
        String sessionId = resolvePresenceSessionId(request);
        String displayName = resolvePresenceDisplayName(callerName, request);
        return ApiResponse.ok(presenceService.join(journalId, sessionId, userId, displayName));
    }

    /**
     * 회계전표 협업 presence leave.
     *
     * <p>호출자가 session owner 일 때만 {@code presence:leave} 이벤트가 발행된다.
     */
    @Operation(summary = "회계전표 협업 presence leave")
    @PostMapping("/presence/leave")
    @RequirePermission(page = JOURNAL_PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<Void> leavePresence(
            @PathVariable("journalId") String journalIdToken,
            @RequestBody(required = false) JournalPresenceRequest request,
            @RequestHeader(CALLER_ID_HEADER) String callerId) {
        UUID journalId = decodeJournalId(journalIdToken);
        ensureJournalExists(journalId);
        String userId = resolvePresenceUserId(callerId);
        presenceService.leave(journalId, resolvePresenceSessionId(request), userId);
        return ApiResponse.ok(null);
    }

    /**
     * 회계전표 협업 현재 presence 목록.
     *
     * <p>account UUID 는 wire payload 에 포함하지 않는다({@code lastSeenAt} 직렬화 제외).
     */
    @Operation(summary = "회계전표 협업 presence 목록")
    @GetMapping("/presence")
    @RequirePermission(page = JOURNAL_PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<List<PresenceEntry>> listPresence(
            @PathVariable("journalId") String journalIdToken) {
        UUID journalId = decodeJournalId(journalIdToken);
        ensureJournalExists(journalId);
        return ApiResponse.ok(presenceService.list(journalId));
    }

    private void ensureJournalExists(UUID journalId) {
        port.loadSnapshot(journalId);
    }

    /** 목록 응답의 opaque journal token과 기존 UUID path 입력을 동일한 내부 키로 복원한다. */
    private UUID decodeJournalId(String journalIdToken) {
        return OpaqueUuidDeserializer.decode(journalIdToken);
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
     * presence 요청의 {@code X-User-Id} 헤더 값을 검증하고 반환한다.
     *
     * @throws BusinessException 헤더가 없거나 빈 값이면 {@link ErrorCode#UNAUTHORIZED}
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
     * presence 요청 body 에서 {@code sessionId} 를 추출하고 검증한다.
     *
     * @throws BusinessException sessionId 가 없거나 빈 값이면 {@link ErrorCode#INVALID_INPUT}
     */
    private String resolvePresenceSessionId(JournalPresenceRequest request) {
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
     * presence 표시명을 결정한다. {@code X-User-Name} 헤더가 우선하며, UUID 형태이면 {@code null} 을 반환한다.
     */
    private String resolvePresenceDisplayName(String callerName, JournalPresenceRequest request) {
        if (callerName != null && !callerName.isBlank()) {
            String resolved = resolveActorName(callerName);
            return "system".equals(resolved) ? null : resolved;
        }
        String resolved = request == null ? null : resolveActorName(request.displayName());
        return "system".equals(resolved) ? null : resolved;
    }

    /**
     * {@code X-User-Id} 헤더 누락 시 presence 엔드포인트에서 401 을 반환한다.
     *
     * <p>다른 필수 헤더 누락은 400 으로 처리한다.
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
