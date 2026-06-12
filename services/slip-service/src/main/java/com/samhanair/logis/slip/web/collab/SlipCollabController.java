package com.samhanair.logis.slip.web.collab;

import com.samhanair.logis.collab.CollabCommentRecord;
import com.samhanair.logis.collab.CollabCommentService;
import com.samhanair.logis.collab.CollabDocumentType;
import com.samhanair.logis.collab.CollabSuggestionService;
import com.samhanair.logis.collab.DocumentCollaborationPort;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import com.samhanair.logis.slip.collab.SlipCollabComment;
import com.samhanair.logis.slip.collab.SlipCollabSuggestion;
import com.samhanair.logis.slip.collab.SlipCollabSuggestionRepository;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.web.collab.dto.AddSlipCollabCommentRequest;
import com.samhanair.logis.slip.web.collab.dto.CreateSlipCollabSuggestionRequest;
import com.samhanair.logis.slip.web.collab.dto.RejectSlipCollabSuggestionRequest;
import com.samhanair.logis.slip.web.collab.dto.SlipCollabCommentResponse;
import com.samhanair.logis.slip.web.collab.dto.SlipCollabSuggestionResponse;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Qualifier;
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
 * 입출고전표 협업 REST/SSE endpoint.
 *
 * <p>댓글/수정제안은 shared/collab-core generic service 를 사용하고, 회귀/복원은 기존
 * {@code /slips/{slipId}/revisions} API 를 source-of-truth 로 유지한다.
 */
@RestController
@RequestMapping("/slips/{slipId}/collab")
public class SlipCollabController {

    private static final String CALLER_ID_HEADER = "X-User-Id";
    private static final String CALLER_NAME_HEADER = "X-User-Name";
    private static final Pattern UUID_SHAPE = Pattern.compile(
            "(?i)^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$");

    private final CollabCommentService<SlipCollabComment> commentService;
    private final CollabSuggestionService<SlipCollabSuggestion> suggestionService;
    private final SlipCollabSuggestionRepository suggestionRepository;
    private final SlipRepository slipRepository;
    private final RealtimeBroker broker;
    private final DocumentCollaborationPort outboundPort;
    private final DocumentCollaborationPort inboundPort;

    public SlipCollabController(
            CollabCommentService<SlipCollabComment> commentService,
            CollabSuggestionService<SlipCollabSuggestion> suggestionService,
            SlipCollabSuggestionRepository suggestionRepository,
            SlipRepository slipRepository,
            RealtimeBroker broker,
            @Qualifier("slipOutboundCollaborationPort") DocumentCollaborationPort outboundPort,
            @Qualifier("slipInboundCollaborationPort") DocumentCollaborationPort inboundPort) {
        this.commentService = commentService;
        this.suggestionService = suggestionService;
        this.suggestionRepository = suggestionRepository;
        this.slipRepository = slipRepository;
        this.broker = broker;
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

    /** 전표 수정 제안 등록. */
    @Operation(summary = "전표 협업 수정 제안 등록")
    @PostMapping("/suggestions")
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = "slip.audit-overlay", action = PermissionAction.UPDATE)
    public ApiResponse<SlipCollabSuggestionResponse> propose(
            @PathVariable UUID slipId,
            @Valid @RequestBody CreateSlipCollabSuggestionRequest request,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        DocumentCollaborationPort port = resolvePort(loadSlip(slipId));
        SlipCollabSuggestion saved = suggestionService.propose(
                port,
                slipId,
                resolveActorId(callerId),
                resolveActorName(callerName),
                request.changeSet(),
                request.reason());
        return ApiResponse.ok(SlipCollabSuggestionResponse.from(saved));
    }

    /** 전표 수정 제안 목록. */
    @Operation(summary = "전표 협업 수정 제안 목록")
    @GetMapping("/suggestions")
    @RequirePermission(page = "slip.audit-overlay", action = PermissionAction.VIEW)
    public ApiResponse<List<SlipCollabSuggestionResponse>> listSuggestions(
            @PathVariable UUID slipId) {
        CollabDocumentType documentType = resolveDocumentType(loadSlip(slipId));
        List<SlipCollabSuggestionResponse> items = suggestionRepository
                .findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(documentType, slipId)
                .stream()
                .map(SlipCollabSuggestionResponse::from)
                .toList();
        return ApiResponse.ok(items);
    }

    /** 전표 수정 제안 수락. */
    @Operation(summary = "전표 협업 수정 제안 수락")
    @PostMapping("/suggestions/{suggestionId}/accept")
    @RequirePermission(page = "slip.audit-overlay", action = PermissionAction.UPDATE)
    public ApiResponse<SlipCollabSuggestionResponse> accept(
            @PathVariable UUID slipId,
            @PathVariable UUID suggestionId,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        Slip slip = loadSlip(slipId);
        DocumentCollaborationPort port = resolvePort(slip);
        ensureSuggestionExistsInPath(suggestionId, port.documentType(), slipId);
        SlipCollabSuggestion accepted = suggestionService.accept(
                suggestionId,
                port,
                resolveActorId(callerId),
                resolveActorName(callerName));
        return ApiResponse.ok(SlipCollabSuggestionResponse.from(accepted));
    }

    /** 전표 수정 제안 거절. */
    @Operation(summary = "전표 협업 수정 제안 거절")
    @PostMapping("/suggestions/{suggestionId}/reject")
    @RequirePermission(page = "slip.audit-overlay", action = PermissionAction.UPDATE)
    public ApiResponse<SlipCollabSuggestionResponse> reject(
            @PathVariable UUID slipId,
            @PathVariable UUID suggestionId,
            @Valid @RequestBody(required = false) RejectSlipCollabSuggestionRequest request,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        Slip slip = loadSlip(slipId);
        DocumentCollaborationPort port = resolvePort(slip);
        ensureSuggestionExistsInPath(suggestionId, port.documentType(), slipId);
        SlipCollabSuggestion rejected = suggestionService.reject(
                suggestionId,
                port,
                resolveActorId(callerId),
                resolveActorName(callerName),
                request == null ? null : request.reason());
        return ApiResponse.ok(SlipCollabSuggestionResponse.from(rejected));
    }

    /** 전표 수정 제안 철회. */
    @Operation(summary = "전표 협업 수정 제안 철회")
    @PostMapping("/suggestions/{suggestionId}/withdraw")
    @RequirePermission(page = "slip.audit-overlay", action = PermissionAction.UPDATE)
    public ApiResponse<SlipCollabSuggestionResponse> withdraw(
            @PathVariable UUID slipId,
            @PathVariable UUID suggestionId,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId) {
        CollabDocumentType documentType = resolveDocumentType(loadSlip(slipId));
        ensureSuggestionExistsInPath(suggestionId, documentType, slipId);
        SlipCollabSuggestion withdrawn = suggestionService.withdraw(
                suggestionId, resolveActorId(callerId));
        return ApiResponse.ok(SlipCollabSuggestionResponse.from(withdrawn));
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

    private DocumentCollaborationPort resolvePort(Slip slip) {
        return resolveDocumentType(slip) == CollabDocumentType.SLIP_OUTBOUND
                ? outboundPort
                : inboundPort;
    }

    private CollabDocumentType resolveDocumentType(Slip slip) {
        return slip.getSlipType() == SlipType.OUTBOUND
                ? CollabDocumentType.SLIP_OUTBOUND
                : CollabDocumentType.SLIP_INBOUND;
    }

    private void ensureSuggestionExistsInPath(UUID suggestionId, CollabDocumentType documentType,
                                              UUID slipId) {
        suggestionRepository.findByIdAndDocumentTypeAndDocumentId(suggestionId, documentType, slipId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "제안을 찾을 수 없습니다"));
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
