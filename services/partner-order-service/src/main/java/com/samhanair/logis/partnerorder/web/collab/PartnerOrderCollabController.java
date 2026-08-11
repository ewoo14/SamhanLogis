package com.samhanair.logis.partnerorder.web.collab;

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
import com.samhanair.logis.partnerorder.collab.PartnerOrderCollabComment;
import com.samhanair.logis.partnerorder.collab.PartnerOrderCollabEditService;
import com.samhanair.logis.partnerorder.collab.PartnerOrderCollabSuggestionRepository;
import com.samhanair.logis.partnerorder.collab.PartnerOrderDocumentCollaborationPort;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.util.PartnerOrderIdResolver;
import com.samhanair.logis.partnerorder.web.collab.dto.AddPartnerOrderCollabCommentRequest;
import com.samhanair.logis.partnerorder.web.collab.dto.CommitPartnerOrderCollabEditRequest;
import com.samhanair.logis.partnerorder.web.collab.dto.PartnerOrderCoeditAwarenessRequest;
import com.samhanair.logis.partnerorder.web.collab.dto.PartnerOrderCoeditUpdateRequest;
import com.samhanair.logis.partnerorder.web.collab.dto.PartnerOrderCoeditUpdatesResponse;
import com.samhanair.logis.partnerorder.web.collab.dto.PartnerOrderCollabCommentResponse;
import com.samhanair.logis.partnerorder.web.collab.dto.PartnerOrderCollabEditResponse;
import com.samhanair.logis.partnerorder.web.collab.dto.PartnerOrderCollabSuggestionResponse;
import com.samhanair.logis.partnerorder.web.collab.dto.PartnerOrderPresenceRequest;
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
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 주문 협업 REST/SSE endpoint.
 *
 * <p>댓글은 shared/collab-core generic service 를 사용하고, 수정은 1-인 수정완료 모델로
 * {@code partner_order_collab_suggestions} 를 ACCEPTED 수정 이력으로 재사용한다.
 */
@RestController
@RequestMapping("/api/v1/partner-orders/{orderId}/collab")
public class PartnerOrderCollabController {

    private static final String CALLER_ID_HEADER = "X-User-Id";
    private static final String CALLER_NAME_HEADER = "X-User-Name";
    private static final String READ_PAGE_CODE = PartnerOrderDocumentCollaborationPort.PARTNER_ORDER_COLLAB_READ_PAGE_CODE;
    private static final String WRITE_PAGE_CODE = PartnerOrderDocumentCollaborationPort.PARTNER_ORDER_COLLAB_WRITE_PAGE_CODE;
    private final CollabCommentService<PartnerOrderCollabComment> commentService;
    private final PartnerOrderCollabEditService editService;
    private final PartnerOrderCollabSuggestionRepository suggestionRepository;
    private final PartnerOrderDocumentCollaborationPort port;
    private final RealtimeBroker broker;
    private final PartnerOrderRepository partnerOrderRepository;
    private final PresenceService presenceService;
    private final CollabCoeditService coeditService;

    public PartnerOrderCollabController(CollabCommentService<PartnerOrderCollabComment> commentService,
                                        PartnerOrderCollabEditService editService,
                                        PartnerOrderCollabSuggestionRepository suggestionRepository,
                                        PartnerOrderDocumentCollaborationPort port,
                                        RealtimeBroker broker,
                                        PartnerOrderRepository partnerOrderRepository,
                                        PresenceService presenceService,
                                        CollabCoeditService coeditService) {
        this.commentService = commentService;
        this.editService = editService;
        this.suggestionRepository = suggestionRepository;
        this.port = port;
        this.broker = broker;
        this.partnerOrderRepository = partnerOrderRepository;
        this.presenceService = presenceService;
        this.coeditService = coeditService;
    }

    /** 주문 협업 댓글 등록. */
    @Operation(summary = "주문 협업 댓글 등록 + SSE push")
    @PostMapping("/comments")
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = WRITE_PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<PartnerOrderCollabCommentResponse> addComment(
            @PathVariable String orderId,
            @Valid @RequestBody AddPartnerOrderCollabCommentRequest request,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        UUID resolvedOrderId = resolveOrderId(orderId);
        PartnerOrderCollabComment saved = commentService.add(
                CollabDocumentType.PARTNER_ORDER,
                resolvedOrderId,
                request.anchor(),
                resolveActorId(callerId),
                resolveActorName(callerName),
                request.body(),
                request.parentId());
        return ApiResponse.ok(PartnerOrderCollabCommentResponse.from(saved));
    }

    /** 주문 협업 최근 댓글 백필. */
    @Operation(summary = "주문 협업 최근 댓글 조회")
    @GetMapping("/comments")
    @RequirePermission(page = READ_PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<List<PartnerOrderCollabCommentResponse>> listComments(
            @PathVariable String orderId,
            @RequestParam(defaultValue = "20") int limit) {
        UUID resolvedOrderId = resolveOrderId(orderId);
        List<PartnerOrderCollabCommentResponse> items = commentService
                .listRecent(CollabDocumentType.PARTNER_ORDER, resolvedOrderId, limit)
                .stream()
                .map(PartnerOrderCollabCommentResponse::from)
                .toList();
        return ApiResponse.ok(items);
    }

    /** 주문 협업 댓글 soft-delete. */
    @Operation(summary = "주문 협업 댓글 soft delete")
    @DeleteMapping("/comments/{commentId}")
    @RequirePermission(page = WRITE_PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<Void> deleteComment(
            @PathVariable String orderId,
            @PathVariable UUID commentId,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId) {
        UUID resolvedOrderId = resolveOrderId(orderId);
        commentService.softDelete(
                CollabDocumentType.PARTNER_ORDER, resolvedOrderId, commentId, resolveDeleter(callerId));
        return ApiResponse.ok(null);
    }

    /** 주문 협업 댓글 해결 처리. */
    @Operation(summary = "주문 협업 댓글 해결 처리")
    @PostMapping("/comments/{commentId}/resolve")
    @RequirePermission(page = WRITE_PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<PartnerOrderCollabCommentResponse> resolveComment(
            @PathVariable String orderId,
            @PathVariable UUID commentId) {
        UUID resolvedOrderId = resolveOrderId(orderId);
        return ApiResponse.ok(PartnerOrderCollabCommentResponse.from(
                commentService.resolve(CollabDocumentType.PARTNER_ORDER, resolvedOrderId, commentId)));
    }

    /** 주문 수정완료. */
    @Operation(summary = "주문 협업 수정완료")
    @PostMapping("/edits")
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = WRITE_PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<PartnerOrderCollabEditResponse> commitEdit(
            @PathVariable String orderId,
            @Valid @RequestBody CommitPartnerOrderCollabEditRequest request,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        UUID resolvedOrderId = resolveOrderId(orderId);
        port.validateChangeSet(request.changeSet());
        PartnerOrderCollabEditService.Result result = editService.commitEdit(
                port, resolvedOrderId, resolveActorId(callerId), resolveActorName(callerName),
                request.changeSet(), request.reason());
        return ApiResponse.ok(new PartnerOrderCollabEditResponse(
                PartnerOrderCollabSuggestionResponse.from(result.edit()), result.order()));
    }

    /** 주문 수정 이력 목록. */
    @Operation(summary = "주문 협업 수정 이력 목록")
    @GetMapping("/edits")
    @RequirePermission(page = READ_PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<List<PartnerOrderCollabSuggestionResponse>> listEdits(
            @PathVariable String orderId) {
        UUID resolvedOrderId = resolveOrderId(orderId);
        List<PartnerOrderCollabSuggestionResponse> items = suggestionRepository
                .findByDocumentTypeAndDocumentIdAndStatusOrderByCreatedAtDesc(
                        CollabDocumentType.PARTNER_ORDER, resolvedOrderId, CollabSuggestionStatus.ACCEPTED)
                .stream()
                .map(PartnerOrderCollabSuggestionResponse::from)
                .toList();
        return ApiResponse.ok(items);
    }

    /** 주문 협업 메모 Yjs update 누적 snapshot. 서버는 update 내용을 해석하지 않는다. */
    @Operation(summary = "주문 협업 메모 coedit update snapshot")
    @GetMapping("/coedit")
    @RequirePermission(page = READ_PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<PartnerOrderCoeditUpdatesResponse> listCoeditUpdates(@PathVariable String orderId) {
        UUID resolvedOrderId = resolveOrderId(orderId);
        return ApiResponse.ok(new PartnerOrderCoeditUpdatesResponse(coeditService.listUpdates(resolvedOrderId)));
    }

    /**
     * 주문 협업 메모 Yjs update relay. 같은 collab SSE stream 으로 coedit:update 이벤트가 발행된다.
     *
     * <p>slip 의 coedit update 가 {@code slip.comments + CREATE} 인 것과 달리, partner-order 는 기존 주문
     * 문서의 편집이므로 {@code sales.partner-order.edit + UPDATE} 를 사용한다(comments/edits 와 동일 권한 모델).
     */
    @Operation(summary = "주문 협업 메모 coedit update relay")
    @PostMapping("/coedit/update")
    @RequirePermission(page = WRITE_PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<Void> appendCoeditUpdate(
            @PathVariable String orderId,
            @RequestBody(required = false) PartnerOrderCoeditUpdateRequest request) {
        UUID resolvedOrderId = resolveOrderId(orderId);
        coeditService.appendUpdate(resolvedOrderId, request == null ? null : request.update());
        return ApiResponse.ok(null);
    }

    /** 주문 협업 메모 cursor/selection relay. 저장하지 않는 ephemeral 이벤트다. */
    @Operation(summary = "주문 협업 메모 coedit awareness relay")
    @PostMapping("/coedit/awareness")
    @RequirePermission(page = READ_PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<Void> publishCoeditAwareness(
            @PathVariable String orderId,
            @RequestBody(required = false) PartnerOrderCoeditAwarenessRequest request) {
        UUID resolvedOrderId = resolveOrderId(orderId);
        coeditService.publishAwareness(resolvedOrderId, request == null ? null : request.awareness());
        return ApiResponse.ok(null);
    }

    /** 주문 협업 SSE stream. 댓글/수정 이벤트는 orderId 채널로 전달된다. */
    @Operation(summary = "주문 협업 SSE stream 구독")
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @RequirePermission(page = READ_PAGE_CODE, action = PermissionAction.VIEW)
    public SseEmitter stream(@PathVariable String orderId) {
        UUID resolvedOrderId = resolveOrderId(orderId);
        return broker.subscribe(resolvedOrderId);
    }

    private UUID resolveOrderId(String orderId) {
        return PartnerOrderIdResolver.findByIdentifier(partnerOrderRepository, orderId)
                .map(PartnerOrder::getId)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.PARTNER_ORDER_NOT_FOUND,
                        ErrorCode.PARTNER_ORDER_NOT_FOUND.getDefaultMessage()));
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

    // ===================================================================
    // Presence — 주문 협업 동시 접속자 (SlipCollabController 1:1 복제, orderId resolve 특이)
    // ===================================================================

    /**
     * 주문 협업 presence join/heartbeat.
     *
     * <p>신규 sessionId 는 기존 collab SSE stream 으로 {@code presence:join} 이벤트가 발행된다.
     * orderId 는 UUID 또는 주문번호 하이픈형을 모두 허용하며, resolveOrderId 를 통해 실 UUID 로 변환된다.
     * SSE stream 과 동일 UUID 채널을 사용하므로 presence 이벤트가 정합하게 전달된다.
     */
    @Operation(summary = "주문 협업 presence join/heartbeat")
    @PostMapping("/presence/join")
    @RequirePermission(page = READ_PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<PresenceEntry> joinPresence(
            @PathVariable String orderId,
            @RequestBody(required = false) PartnerOrderPresenceRequest request,
            @RequestHeader(CALLER_ID_HEADER) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        UUID resolvedOrderId = resolveOrderId(orderId);
        String userId = resolvePresenceUserId(callerId);
        String sessionId = resolvePresenceSessionId(request);
        String displayName = resolvePresenceDisplayName(callerName, request);
        return ApiResponse.ok(presenceService.join(resolvedOrderId, sessionId, userId, displayName));
    }

    /**
     * 주문 협업 presence leave.
     *
     * <p>호출자가 session owner 일 때만 {@code presence:leave} 이벤트가 발행된다.
     */
    @Operation(summary = "주문 협업 presence leave")
    @PostMapping("/presence/leave")
    @RequirePermission(page = READ_PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<Void> leavePresence(
            @PathVariable String orderId,
            @RequestBody(required = false) PartnerOrderPresenceRequest request,
            @RequestHeader(CALLER_ID_HEADER) String callerId) {
        UUID resolvedOrderId = resolveOrderId(orderId);
        String userId = resolvePresenceUserId(callerId);
        presenceService.leave(resolvedOrderId, resolvePresenceSessionId(request), userId);
        return ApiResponse.ok(null);
    }

    /**
     * 주문 협업 현재 presence 목록.
     *
     * <p>account UUID 는 wire payload 에 포함하지 않는다.
     */
    @Operation(summary = "주문 협업 presence 목록")
    @GetMapping("/presence")
    @RequirePermission(page = READ_PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<List<PresenceEntry>> listPresence(@PathVariable String orderId) {
        UUID resolvedOrderId = resolveOrderId(orderId);
        return ApiResponse.ok(presenceService.list(resolvedOrderId));
    }

    /**
     * presence 사용자 ID 를 X-User-Id 헤더에서 추출한다.
     *
     * <p>color hash 입력으로 사용되므로 UUID 변환 없이 원문 그대로 반환한다.
     * 헤더가 없거나 공백이면 UNAUTHORIZED 예외를 던진다.
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
     * presence sessionId 를 요청 body 에서 추출한다.
     *
     * <p>sessionId 가 없거나 공백이면 INVALID_INPUT 예외를 던진다.
     */
    private String resolvePresenceSessionId(PartnerOrderPresenceRequest request) {
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
     * presence 표시명을 결정한다.
     *
     * <p>X-User-Name 헤더가 있으면 우선 적용하고, UUID 형태이거나 비어있으면 null 을 반환하여
     * PresenceService 의 기본값("사용자")이 적용되도록 한다.
     * 헤더가 없으면 body 의 displayName 을 사용한다.
     */
    private String resolvePresenceDisplayName(String callerName, PartnerOrderPresenceRequest request) {
        if (callerName != null && !callerName.isBlank()) {
            String resolved = resolveActorName(callerName);
            return "system".equals(resolved) ? null : resolved;
        }
        String resolved = request == null ? null : resolveActorName(request.displayName());
        return "system".equals(resolved) ? null : resolved;
    }

    /**
     * 필수 헤더 누락 예외를 처리한다.
     *
     * <p>X-User-Id 누락 시 401 UNAUTHORIZED, 그 외 필수 헤더 누락 시 400 INVALID_INPUT 을 반환한다.
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
