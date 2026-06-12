package com.samhanair.logis.slip.web.dispatch;

import com.samhanair.logis.collab.CollabCommentService;
import com.samhanair.logis.collab.CollabCommentRecord;
import com.samhanair.logis.collab.CollabDocumentType;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import com.samhanair.logis.slip.dispatch.collab.DispatchCollabComment;
import com.samhanair.logis.slip.repository.dispatch.DispatchTaskRepository;
import com.samhanair.logis.slip.web.dispatch.dto.AddDispatchCommentRequest;
import com.samhanair.logis.slip.web.dispatch.dto.DispatchCommentResponse;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;
import lombok.extern.slf4j.Slf4j;
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
 * DispatchTask 협업 댓글 REST/SSE endpoint.
 *
 * <p>shared/collab-core 의 {@link CollabCommentService} 를 배차 도메인에 연결하는 첫 reference.
 * arologis 전송/수정 요청 흐름과 분리된 순수 댓글 채널이다.
 */
@RestController
@RequestMapping("/admin/dispatch-tasks/{taskId}")
@Slf4j
public class DispatchCollabCommentController {

    private static final String CALLER_ID_HEADER = "X-User-Id";
    private static final String CALLER_NAME_HEADER = "X-User-Name";
    private static final Pattern UUID_SHAPE = Pattern.compile(
            "(?i)^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$");

    private final CollabCommentService<DispatchCollabComment> commentService;
    private final RealtimeBroker broker;
    private final DispatchTaskRepository dispatchTaskRepository;

    public DispatchCollabCommentController(
            CollabCommentService<DispatchCollabComment> commentService,
            RealtimeBroker broker,
            DispatchTaskRepository dispatchTaskRepository) {
        this.commentService = commentService;
        this.broker = broker;
        this.dispatchTaskRepository = dispatchTaskRepository;
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

    /** DispatchTask 협업 SSE stream. 댓글 이벤트는 taskId 채널로 전달된다. */
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

    private void ensureTaskExists(UUID taskId) {
        if (!dispatchTaskRepository.existsByIdAndIsDeletedFalse(taskId)) {
            log.warn("[DispatchCollabCommentController] 배차 작업 미존재 — taskId={}", taskId);
            throw new BusinessException(ErrorCode.NOT_FOUND, "대상 배차 작업을 찾을 수 없습니다");
        }
    }
}
