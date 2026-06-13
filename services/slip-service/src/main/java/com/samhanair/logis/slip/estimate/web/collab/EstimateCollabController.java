package com.samhanair.logis.slip.estimate.web.collab;

import com.samhanair.logis.collab.CollabCommentRecord;
import com.samhanair.logis.collab.CollabCommentService;
import com.samhanair.logis.collab.CollabDocumentType;
import com.samhanair.logis.collab.CollabSuggestionStatus;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import com.samhanair.logis.slip.estimate.collab.EstimateCollabComment;
import com.samhanair.logis.slip.estimate.collab.EstimateCollabEditService;
import com.samhanair.logis.slip.estimate.collab.EstimateCollabSuggestionRepository;
import com.samhanair.logis.slip.estimate.collab.EstimateDocumentCollaborationPort;
import com.samhanair.logis.slip.estimate.repository.EstimateRepository;
import com.samhanair.logis.slip.estimate.web.EstimatePermissionGuard;
import com.samhanair.logis.slip.estimate.web.collab.dto.AddEstimateCollabCommentRequest;
import com.samhanair.logis.slip.estimate.web.collab.dto.CommitEstimateCollabEditRequest;
import com.samhanair.logis.slip.estimate.web.collab.dto.EstimateCollabCommentResponse;
import com.samhanair.logis.slip.estimate.web.collab.dto.EstimateCollabEditResponse;
import com.samhanair.logis.slip.estimate.web.collab.dto.EstimateCollabSuggestionResponse;
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
    private static final String SYSTEM_MASTER_HEADER = "X-Is-System-Master";
    private static final Pattern UUID_SHAPE = Pattern.compile(
            "(?i)^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$");

    private final CollabCommentService<EstimateCollabComment> commentService;
    private final EstimateCollabEditService editService;
    private final EstimateCollabSuggestionRepository suggestionRepository;
    private final EstimateDocumentCollaborationPort port;
    private final RealtimeBroker broker;
    private final EstimateRepository estimateRepository;
    private final EstimatePermissionGuard permissionGuard;

    public EstimateCollabController(CollabCommentService<EstimateCollabComment> commentService,
                                    EstimateCollabEditService editService,
                                    EstimateCollabSuggestionRepository suggestionRepository,
                                    EstimateDocumentCollaborationPort port,
                                    RealtimeBroker broker,
                                    EstimateRepository estimateRepository,
                                    EstimatePermissionGuard permissionGuard) {
        this.commentService = commentService;
        this.editService = editService;
        this.suggestionRepository = suggestionRepository;
        this.port = port;
        this.broker = broker;
        this.estimateRepository = estimateRepository;
        this.permissionGuard = permissionGuard;
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
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName,
            @RequestHeader(value = SYSTEM_MASTER_HEADER, required = false) String isSystemMaster) {
        ensureEstimateExists(estimateId);
        permissionGuard.checkEdit(parseAccountIdOrNull(callerId), isSystemMaster, PermissionAction.UPDATE);
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
            @RequestParam(defaultValue = "20") int limit,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = SYSTEM_MASTER_HEADER, required = false) String isSystemMaster) {
        ensureEstimateExists(estimateId);
        permissionGuard.checkView(parseAccountIdOrNull(callerId), isSystemMaster);
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
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = SYSTEM_MASTER_HEADER, required = false) String isSystemMaster) {
        ensureEstimateExists(estimateId);
        permissionGuard.checkEdit(parseAccountIdOrNull(callerId), isSystemMaster, PermissionAction.UPDATE);
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
            @PathVariable UUID commentId,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = SYSTEM_MASTER_HEADER, required = false) String isSystemMaster) {
        ensureEstimateExists(estimateId);
        permissionGuard.checkEdit(parseAccountIdOrNull(callerId), isSystemMaster, PermissionAction.UPDATE);
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
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName,
            @RequestHeader(value = SYSTEM_MASTER_HEADER, required = false) String isSystemMaster) {
        ensureEstimateExists(estimateId);
        permissionGuard.checkEdit(parseAccountIdOrNull(callerId), isSystemMaster, PermissionAction.UPDATE);
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
            @PathVariable UUID estimateId,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = SYSTEM_MASTER_HEADER, required = false) String isSystemMaster) {
        ensureEstimateExists(estimateId);
        permissionGuard.checkView(parseAccountIdOrNull(callerId), isSystemMaster);
        List<EstimateCollabSuggestionResponse> items = suggestionRepository
                .findByDocumentTypeAndDocumentIdAndStatusOrderByCreatedAtDesc(
                        CollabDocumentType.ESTIMATE, estimateId, CollabSuggestionStatus.ACCEPTED)
                .stream()
                .map(EstimateCollabSuggestionResponse::from)
                .toList();
        return ApiResponse.ok(items);
    }

    /** 견적 협업 SSE stream. 댓글/수정 이벤트는 estimateId 채널로 전달된다. */
    @Operation(summary = "견적 협업 SSE stream 구독")
    @GetMapping(value = "/{estimateId}/collab/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @RequirePermission(page = EstimatePermissionGuard.PAGE_CODE, action = PermissionAction.VIEW)
    public SseEmitter stream(
            @PathVariable UUID estimateId,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = SYSTEM_MASTER_HEADER, required = false) String isSystemMaster) {
        ensureEstimateExists(estimateId);
        permissionGuard.checkView(parseAccountIdOrNull(callerId), isSystemMaster);
        return broker.subscribe(estimateId);
    }

    private void ensureEstimateExists(UUID estimateId) {
        if (!estimateRepository.existsById(estimateId)) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "대상 견적을 찾을 수 없습니다");
        }
    }

    private UUID parseAccountIdOrNull(String header) {
        if (header == null || header.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(header);
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "계정 권한 식별자가 올바르지 않습니다.");
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
