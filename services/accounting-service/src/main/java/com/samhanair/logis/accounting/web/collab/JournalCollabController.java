package com.samhanair.logis.accounting.web.collab;

import com.samhanair.logis.accounting.collab.JournalCollabComment;
import com.samhanair.logis.accounting.collab.JournalCollabEditService;
import com.samhanair.logis.accounting.collab.JournalCollabSuggestionRepository;
import com.samhanair.logis.accounting.collab.JournalDocumentCollaborationPort;
import com.samhanair.logis.accounting.web.collab.dto.AddJournalCollabCommentRequest;
import com.samhanair.logis.accounting.web.collab.dto.CommitJournalCollabEditRequest;
import com.samhanair.logis.accounting.web.collab.dto.JournalCollabCommentResponse;
import com.samhanair.logis.accounting.web.collab.dto.JournalCollabEditResponse;
import com.samhanair.logis.accounting.web.collab.dto.JournalCollabSuggestionResponse;
import com.samhanair.logis.collab.CollabCommentRecord;
import com.samhanair.logis.collab.CollabCommentService;
import com.samhanair.logis.collab.CollabDocumentType;
import com.samhanair.logis.collab.CollabSuggestionStatus;
import com.samhanair.logis.common.dto.ApiResponse;
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
    private static final Pattern UUID_SHAPE = Pattern.compile(
            "(?i)^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$");

    private final CollabCommentService<JournalCollabComment> commentService;
    private final JournalCollabEditService editService;
    private final JournalCollabSuggestionRepository suggestionRepository;
    private final JournalDocumentCollaborationPort port;
    private final RealtimeBroker broker;

    public JournalCollabController(CollabCommentService<JournalCollabComment> commentService,
                                   JournalCollabEditService editService,
                                   JournalCollabSuggestionRepository suggestionRepository,
                                   JournalDocumentCollaborationPort port,
                                   RealtimeBroker broker) {
        this.commentService = commentService;
        this.editService = editService;
        this.suggestionRepository = suggestionRepository;
        this.port = port;
        this.broker = broker;
    }

    /** 회계전표 협업 댓글 등록. */
    @Operation(summary = "회계전표 협업 댓글 등록 + SSE push")
    @PostMapping("/comments")
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = JOURNAL_PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<JournalCollabCommentResponse> addComment(
            @PathVariable UUID journalId,
            @Valid @RequestBody AddJournalCollabCommentRequest request,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
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
            @PathVariable UUID journalId,
            @RequestParam(defaultValue = "20") int limit) {
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
            @PathVariable UUID journalId,
            @PathVariable UUID commentId,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId) {
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
            @PathVariable UUID journalId,
            @PathVariable UUID commentId) {
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
            @PathVariable UUID journalId,
            @Valid @RequestBody CommitJournalCollabEditRequest request,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
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
            @PathVariable UUID journalId) {
        ensureJournalExists(journalId);
        List<JournalCollabSuggestionResponse> items = suggestionRepository
                .findByDocumentTypeAndDocumentIdAndStatusOrderByCreatedAtDesc(
                        CollabDocumentType.ACCOUNTING_VOUCHER, journalId, CollabSuggestionStatus.ACCEPTED)
                .stream()
                .map(JournalCollabSuggestionResponse::from)
                .toList();
        return ApiResponse.ok(items);
    }

    /** 회계전표 협업 SSE stream. 댓글/수정 이벤트는 journalId 채널로 전달된다. */
    @Operation(summary = "회계전표 협업 SSE stream 구독")
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @RequirePermission(page = JOURNAL_PAGE_CODE, action = PermissionAction.VIEW)
    public SseEmitter stream(@PathVariable UUID journalId) {
        ensureJournalExists(journalId);
        return broker.subscribe(journalId);
    }

    private void ensureJournalExists(UUID journalId) {
        port.loadSnapshot(journalId);
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
