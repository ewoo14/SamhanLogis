package com.samhanair.logis.slip.web.collab;

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
import com.samhanair.logis.slip.collab.SlipCollabComment;
import com.samhanair.logis.slip.collab.SlipCollabEditService;
import com.samhanair.logis.slip.collab.SlipCollabSuggestionRepository;
import com.samhanair.logis.slip.collab.SlipDocumentCollaborationPort;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.web.collab.dto.AddSlipCollabCommentRequest;
import com.samhanair.logis.slip.web.collab.dto.CommitSlipCollabEditRequest;
import com.samhanair.logis.slip.web.collab.dto.SlipCollabEditResponse;
import com.samhanair.logis.slip.web.collab.dto.SlipCollabCommentResponse;
import com.samhanair.logis.slip.web.collab.dto.SlipCollabSuggestionResponse;
import com.samhanair.logis.slip.web.collab.dto.SlipCoeditAwarenessRequest;
import com.samhanair.logis.slip.web.collab.dto.SlipCoeditUpdateRequest;
import com.samhanair.logis.slip.web.collab.dto.SlipCoeditUpdatesResponse;
import com.samhanair.logis.slip.web.collab.dto.SlipPresenceRequest;
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
 * 입출고전표 협업 REST/SSE endpoint.
 *
 * <p>댓글은 shared/collab-core generic service 를 사용하고, 수정은 1-인 수정완료 모델로
 * 기존 수정 이력 테이블을 재사용한다. 회귀/복원은 기존
 * {@code /slips/{slipId}/revisions} API 를 source-of-truth 로 유지한다.
 */
@RestController
@RequestMapping("/slips/{slipId}/collab")
public class SlipCollabController {

    private static final String CALLER_ID_HEADER = "X-User-Id";
    private static final String CALLER_NAME_HEADER = "X-User-Name";
    private final CollabCommentService<SlipCollabComment> commentService;
    private final SlipCollabEditService editService;
    private final SlipCollabSuggestionRepository suggestionRepository;
    private final SlipRepository slipRepository;
    private final RealtimeBroker broker;
    private final PresenceService presenceService;
    private final CollabCoeditService coeditService;
    /**
     * 포트는 concrete 타입으로 주입한다 — 수정완료 시점
     * {@link SlipDocumentCollaborationPort#validateChangeSet} 조기 검증 호출용 (Round C P2).
     */
    private final SlipDocumentCollaborationPort outboundPort;
    private final SlipDocumentCollaborationPort inboundPort;

    public SlipCollabController(
            CollabCommentService<SlipCollabComment> commentService,
            SlipCollabEditService editService,
            SlipCollabSuggestionRepository suggestionRepository,
            SlipRepository slipRepository,
            RealtimeBroker broker,
            PresenceService presenceService,
            CollabCoeditService coeditService,
            @Qualifier("slipOutboundCollaborationPort") SlipDocumentCollaborationPort outboundPort,
            @Qualifier("slipInboundCollaborationPort") SlipDocumentCollaborationPort inboundPort) {
        this.commentService = commentService;
        this.editService = editService;
        this.suggestionRepository = suggestionRepository;
        this.slipRepository = slipRepository;
        this.broker = broker;
        this.presenceService = presenceService;
        this.coeditService = coeditService;
        this.outboundPort = outboundPort;
        this.inboundPort = inboundPort;
    }

    /** 전표 협업 댓글 등록. */
    @Operation(summary = "전표 협업 댓글 등록 + SSE push")
    @PostMapping("/comments")
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = "slip.comments", action = PermissionAction.CREATE)
    public ApiResponse<SlipCollabCommentResponse> addComment(
            @PathVariable UUID slipId,
            @Valid @RequestBody AddSlipCollabCommentRequest request,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        CollabDocumentType documentType = resolveDocumentType(loadSlip(slipId));
        SlipCollabComment saved = commentService.add(
                documentType,
                slipId,
                request.anchor(),
                resolveActorId(callerId),
                resolveActorName(callerName),
                request.body(),
                request.parentId());
        return ApiResponse.ok(SlipCollabCommentResponse.from(saved));
    }

    /** 전표 협업 최근 댓글 백필. */
    @Operation(summary = "전표 협업 최근 댓글 조회")
    @GetMapping("/comments")
    @RequirePermission(page = "slip.comments", action = PermissionAction.VIEW)
    public ApiResponse<List<SlipCollabCommentResponse>> listComments(
            @PathVariable UUID slipId,
            @RequestParam(defaultValue = "20") int limit) {
        CollabDocumentType documentType = resolveDocumentType(loadSlip(slipId));
        List<SlipCollabCommentResponse> items = commentService
                .listRecent(documentType, slipId, limit)
                .stream()
                .map(SlipCollabCommentResponse::from)
                .toList();
        return ApiResponse.ok(items);
    }

    /** 전표 협업 댓글 soft-delete. */
    @Operation(summary = "전표 협업 댓글 soft delete")
    @DeleteMapping("/comments/{commentId}")
    @RequirePermission(page = "slip.comments", action = PermissionAction.DELETE)
    public ApiResponse<Void> deleteComment(
            @PathVariable UUID slipId,
            @PathVariable UUID commentId,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId) {
        CollabDocumentType documentType = resolveDocumentType(loadSlip(slipId));
        commentService.softDelete(documentType, slipId, commentId, resolveDeleter(callerId));
        return ApiResponse.ok(null);
    }

    /** 전표 협업 댓글 해결 처리. */
    @Operation(summary = "전표 협업 댓글 해결 처리")
    @PostMapping("/comments/{commentId}/resolve")
    @RequirePermission(page = "slip.comments", action = PermissionAction.UPDATE)
    public ApiResponse<SlipCollabCommentResponse> resolveComment(
            @PathVariable UUID slipId,
            @PathVariable UUID commentId) {
        CollabDocumentType documentType = resolveDocumentType(loadSlip(slipId));
        return ApiResponse.ok(SlipCollabCommentResponse.from(
                commentService.resolve(documentType, slipId, commentId)));
    }

    /**
     * 전표 수정완료.
     *
     * <p>권한자가 본인 편집 내용을 즉시 커밋한다. 별도 제안자/수락자 2단계는 만들지 않는다.
     * 기존 {@code slip_collab_suggestions} row 는 ACCEPTED 수정 이력으로 재사용한다.
     */
    @Operation(summary = "전표 협업 수정완료")
    @PostMapping("/edits")
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = "slip.audit-overlay", action = PermissionAction.UPDATE)
    public ApiResponse<SlipCollabEditResponse> commitEdit(
            @PathVariable UUID slipId,
            @Valid @RequestBody CommitSlipCollabEditRequest request,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        SlipDocumentCollaborationPort port = resolvePort(loadSlip(slipId));
        SlipCollabEditService.Result result = editService.commitEdit(
                port, slipId, resolveActorId(callerId), resolveActorName(callerName),
                request.changeSet(), request.reason());
        return ApiResponse.ok(new SlipCollabEditResponse(
                SlipCollabSuggestionResponse.from(result.edit()), result.slip()));
    }

    /** 전표 수정 이력 목록. */
    @Operation(summary = "전표 협업 수정 이력 목록")
    @GetMapping("/edits")
    @RequirePermission(page = "slip.audit-overlay", action = PermissionAction.VIEW)
    public ApiResponse<List<SlipCollabSuggestionResponse>> listEdits(
            @PathVariable UUID slipId) {
        CollabDocumentType documentType = resolveDocumentType(loadSlip(slipId));
        List<SlipCollabSuggestionResponse> items = suggestionRepository
                .findByDocumentTypeAndDocumentIdAndStatusOrderByCreatedAtDesc(
                        documentType, slipId, CollabSuggestionStatus.ACCEPTED)
                .stream()
                .map(SlipCollabSuggestionResponse::from)
                .toList();
        return ApiResponse.ok(items);
    }

    /** 전표 협업 presence join/heartbeat. 신규 sessionId 는 기존 collab SSE stream 으로 presence:join 이벤트가 발행된다. */
    @Operation(summary = "전표 협업 presence join/heartbeat")
    @PostMapping("/presence/join")
    @RequirePermission(page = "slip.comments", action = PermissionAction.VIEW)
    public ApiResponse<PresenceEntry> joinPresence(
            @PathVariable UUID slipId,
            @RequestBody(required = false) SlipPresenceRequest request,
            @RequestHeader(CALLER_ID_HEADER) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        loadSlip(slipId);
        String userId = resolvePresenceUserId(callerId);
        String sessionId = resolvePresenceSessionId(request);
        String displayName = resolvePresenceDisplayName(callerName, request);
        return ApiResponse.ok(presenceService.join(slipId, sessionId, userId, displayName));
    }

    /** 전표 협업 presence leave. 호출자가 session owner 일 때만 presence:leave 이벤트가 발행된다. */
    @Operation(summary = "전표 협업 presence leave")
    @PostMapping("/presence/leave")
    @RequirePermission(page = "slip.comments", action = PermissionAction.VIEW)
    public ApiResponse<Void> leavePresence(
            @PathVariable UUID slipId,
            @RequestBody(required = false) SlipPresenceRequest request,
            @RequestHeader(CALLER_ID_HEADER) String callerId) {
        loadSlip(slipId);
        String userId = resolvePresenceUserId(callerId);
        presenceService.leave(slipId, resolvePresenceSessionId(request), userId);
        return ApiResponse.ok(null);
    }

    /** 전표 협업 현재 presence 목록. account UUID 는 wire payload 에 포함하지 않는다. */
    @Operation(summary = "전표 협업 presence 목록")
    @GetMapping("/presence")
    @RequirePermission(page = "slip.comments", action = PermissionAction.VIEW)
    public ApiResponse<List<PresenceEntry>> listPresence(@PathVariable UUID slipId) {
        loadSlip(slipId);
        return ApiResponse.ok(presenceService.list(slipId));
    }

    /** 전표 협업 메모 Yjs update 누적 snapshot. 서버는 update 내용을 해석하지 않는다. */
    @Operation(summary = "전표 협업 메모 coedit update snapshot")
    @GetMapping("/coedit")
    @RequirePermission(page = "slip.comments", action = PermissionAction.VIEW)
    public ApiResponse<SlipCoeditUpdatesResponse> listCoeditUpdates(@PathVariable UUID slipId) {
        loadSlip(slipId);
        return ApiResponse.ok(new SlipCoeditUpdatesResponse(coeditService.listUpdates(slipId)));
    }

    /** 전표 협업 메모 Yjs update relay. 같은 collab SSE stream 으로 coedit:update 이벤트가 발행된다. */
    @Operation(summary = "전표 협업 메모 coedit update relay")
    @PostMapping("/coedit/update")
    @RequirePermission(page = "slip.comments", action = PermissionAction.CREATE)
    public ApiResponse<Void> appendCoeditUpdate(
            @PathVariable UUID slipId,
            @RequestBody(required = false) SlipCoeditUpdateRequest request) {
        loadSlip(slipId);
        coeditService.appendUpdate(slipId, request == null ? null : request.update());
        return ApiResponse.ok(null);
    }

    /** 전표 협업 메모 cursor/selection relay. 저장하지 않는 ephemeral 이벤트다. */
    @Operation(summary = "전표 협업 메모 coedit awareness relay")
    @PostMapping("/coedit/awareness")
    @RequirePermission(page = "slip.comments", action = PermissionAction.VIEW)
    public ApiResponse<Void> publishCoeditAwareness(
            @PathVariable UUID slipId,
            @RequestBody(required = false) SlipCoeditAwarenessRequest request) {
        loadSlip(slipId);
        coeditService.publishAwareness(slipId, request == null ? null : request.awareness());
        return ApiResponse.ok(null);
    }

    /** 전표 협업 SSE stream. 댓글/제안/복원 이벤트는 slipId 채널로 전달된다. */
    @Operation(summary = "전표 협업 SSE stream 구독")
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @RequirePermission(page = "slip.comments", action = PermissionAction.VIEW)
    public SseEmitter stream(@PathVariable UUID slipId) {
        loadSlip(slipId);
        return broker.subscribe(slipId);
    }

    private Slip loadSlip(UUID slipId) {
        return slipRepository.findById(slipId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "대상 전표를 찾을 수 없습니다"));
    }

    private SlipDocumentCollaborationPort resolvePort(Slip slip) {
        return resolveDocumentType(slip) == CollabDocumentType.SLIP_OUTBOUND
                ? outboundPort
                : inboundPort;
    }

    private CollabDocumentType resolveDocumentType(Slip slip) {
        return slip.getSlipType() == SlipType.OUTBOUND
                ? CollabDocumentType.SLIP_OUTBOUND
                : CollabDocumentType.SLIP_INBOUND;
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

    private String resolvePresenceUserId(String callerId) {
        String headerUserId = callerId == null ? null : callerId.trim();
        if (headerUserId != null && !headerUserId.isBlank()) {
            return headerUserId;
        }
        throw new BusinessException(ErrorCode.UNAUTHORIZED,
                "presence 사용자 정보를 확인할 수 없습니다");
    }

    private String resolvePresenceSessionId(SlipPresenceRequest request) {
        String sessionId = request == null || request.sessionId() == null
                ? null
                : request.sessionId().trim();
        if (sessionId == null || sessionId.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "presence sessionId 는 필수입니다");
        }
        return sessionId;
    }

    private String resolvePresenceDisplayName(String callerName, SlipPresenceRequest request) {
        if (callerName != null && !callerName.isBlank()) {
            String resolved = resolveActorName(callerName);
            return "system".equals(resolved) ? null : resolved;
        }
        String resolved = request == null ? null : resolveActorName(request.displayName());
        return "system".equals(resolved) ? null : resolved;
    }

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
