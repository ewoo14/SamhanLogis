package com.samhanair.logis.groupware.controller;

import com.samhanair.logis.collab.CollabCommentRecord;
import com.samhanair.logis.collab.CollabCommentService;
import com.samhanair.logis.collab.CollabDocumentType;
import com.samhanair.logis.collab.CollabSuggestionStatus;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.groupware.collab.ApprovalCollabComment;
import com.samhanair.logis.groupware.collab.ApprovalCollabSuggestionRepository;
import com.samhanair.logis.groupware.collab.GroupwareApprovalCollabEditService;
import com.samhanair.logis.groupware.collab.GroupwareApprovalDocumentCollaborationPort;
import com.samhanair.logis.groupware.repository.ApprovalLineRepository;
import com.samhanair.logis.groupware.web.collab.dto.AddApprovalCollabCommentRequest;
import com.samhanair.logis.groupware.web.collab.dto.ApprovalCollabCommentResponse;
import com.samhanair.logis.groupware.web.collab.dto.ApprovalCollabEditResponse;
import com.samhanair.logis.groupware.web.collab.dto.ApprovalCollabSuggestionResponse;
import com.samhanair.logis.groupware.web.collab.dto.CommitApprovalCollabEditRequest;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
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
    private static final Pattern UUID_SHAPE = Pattern.compile(
            "(?i)^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$");

    private final CollabCommentService<ApprovalCollabComment> commentService;
    private final GroupwareApprovalCollabEditService editService;
    private final ApprovalCollabSuggestionRepository suggestionRepository;
    private final GroupwareApprovalDocumentCollaborationPort port;
    private final RealtimeBroker broker;
    private final ApprovalLineRepository approvalLineRepository;

    public GroupwareApprovalCollabController(
            @Qualifier("groupwareApprovalCollabCommentService")
            CollabCommentService<ApprovalCollabComment> commentService,
            GroupwareApprovalCollabEditService editService,
            ApprovalCollabSuggestionRepository suggestionRepository,
            GroupwareApprovalDocumentCollaborationPort port,
            RealtimeBroker broker,
            ApprovalLineRepository approvalLineRepository) {
        this.commentService = commentService;
        this.editService = editService;
        this.suggestionRepository = suggestionRepository;
        this.port = port;
        this.broker = broker;
        this.approvalLineRepository = approvalLineRepository;
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

    /** 결재 협업 SSE stream. 댓글/수정 이벤트는 approvalId 채널로 전달된다. */
    @Operation(summary = "결재 협업 SSE stream 구독")
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    public SseEmitter stream(@PathVariable UUID approvalId) {
        ensureApprovalExists(approvalId);
        return broker.subscribe(approvalId);
    }

    private void ensureApprovalExists(UUID approvalId) {
        if (!approvalLineRepository.existsById(approvalId)) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "대상 결재 문서를 찾을 수 없습니다");
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
