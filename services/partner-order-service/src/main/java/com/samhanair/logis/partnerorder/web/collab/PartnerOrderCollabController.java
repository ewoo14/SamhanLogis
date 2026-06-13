package com.samhanair.logis.partnerorder.web.collab;

import com.samhanair.logis.collab.CollabCommentRecord;
import com.samhanair.logis.collab.CollabCommentService;
import com.samhanair.logis.collab.CollabDocumentType;
import com.samhanair.logis.collab.CollabSuggestionStatus;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partnerorder.collab.PartnerOrderCollabComment;
import com.samhanair.logis.partnerorder.collab.PartnerOrderCollabEditService;
import com.samhanair.logis.partnerorder.collab.PartnerOrderCollabSuggestionRepository;
import com.samhanair.logis.partnerorder.collab.PartnerOrderDocumentCollaborationPort;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.util.PartnerOrderIdResolver;
import com.samhanair.logis.partnerorder.web.collab.dto.AddPartnerOrderCollabCommentRequest;
import com.samhanair.logis.partnerorder.web.collab.dto.CommitPartnerOrderCollabEditRequest;
import com.samhanair.logis.partnerorder.web.collab.dto.PartnerOrderCollabCommentResponse;
import com.samhanair.logis.partnerorder.web.collab.dto.PartnerOrderCollabEditResponse;
import com.samhanair.logis.partnerorder.web.collab.dto.PartnerOrderCollabSuggestionResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
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
    private static final Pattern UUID_SHAPE = Pattern.compile(
            "(?i)^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$");

    private final CollabCommentService<PartnerOrderCollabComment> commentService;
    private final PartnerOrderCollabEditService editService;
    private final PartnerOrderCollabSuggestionRepository suggestionRepository;
    private final PartnerOrderDocumentCollaborationPort port;
    private final RealtimeBroker broker;
    private final PartnerOrderRepository partnerOrderRepository;

    public PartnerOrderCollabController(CollabCommentService<PartnerOrderCollabComment> commentService,
                                        PartnerOrderCollabEditService editService,
                                        PartnerOrderCollabSuggestionRepository suggestionRepository,
                                        PartnerOrderDocumentCollaborationPort port,
                                        RealtimeBroker broker,
                                        PartnerOrderRepository partnerOrderRepository) {
        this.commentService = commentService;
        this.editService = editService;
        this.suggestionRepository = suggestionRepository;
        this.port = port;
        this.broker = broker;
        this.partnerOrderRepository = partnerOrderRepository;
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
        if (callerName == null || callerName.isBlank()) {
            return "system";
        }
        String normalized = callerName.trim();
        if (UUID_SHAPE.matcher(normalized).matches()) {
            return "system";
        }
        return normalized.length() <= CollabCommentRecord.MAX_AUTHOR_NAME_LENGTH
                ? normalized
                : normalized.substring(0, CollabCommentRecord.MAX_AUTHOR_NAME_LENGTH);
    }

    private String resolveDeleter(String callerId) {
        return (callerId == null || callerId.isBlank()) ? "system" : callerId;
    }
}
