package com.samhanair.logis.slip.comment.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.slip.comment.domain.SlipComment;
import com.samhanair.logis.slip.comment.service.SlipCommentService;
import com.samhanair.logis.slip.comment.web.dto.AddSlipCommentRequest;
import com.samhanair.logis.slip.comment.web.dto.SlipCommentResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 슬립 댓글 REST endpoint — PR-H1 (Phase 12 Step 1).
 *
 * <p>권한 매트릭스:
 * <ul>
 *   <li>등록 (POST) — SALES, WAREHOUSE, MANAGER, MASTER (실시간 협업 주체)</li>
 *   <li>조회 (GET) — 모든 인증 사용자 (slip 화면 표시)</li>
 * </ul>
 *
 * <p>응답 형식 = {@link ApiResponse} wrapper (D-P10-12 일관).
 */
@RestController
@RequestMapping("/slips/{slipId}/comments")
@RequiredArgsConstructor
public class SlipCommentController {

    private static final String CALLER_ID_HEADER = "X-User-Id";
    private static final String CALLER_NAME_HEADER = "X-User-Name";

    private final SlipCommentService commentService;

    /**
     * 신규 댓글 등록. authorId = X-User-Id 헤더, authorName = X-User-Name 헤더 (없으면 "system").
     *
     * <p>등록 직후 {@link com.samhanair.logis.slip.realtime.SlipRealtimeBroker} 가
     * SSE event {@code comment.created} 로 해당 슬립 SSE 구독자에게 push.
     */
    @Operation(summary = "슬립 댓글 등록 + SSE push",
            description = "SALES/WAREHOUSE/MANAGER/MASTER 권한. 등록 직후 SSE event 'comment.created' 자동 push")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "등록 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "본문 검증 실패"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "슬립 미존재")
    })
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission(page = "slip.comments", action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    public ApiResponse<SlipCommentResponse> add(
            @PathVariable UUID slipId,
            @Valid @RequestBody AddSlipCommentRequest request,
            @RequestHeader(value = CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = CALLER_NAME_HEADER, required = false) String callerName) {
        UUID authorId = resolveAuthorId(callerId);
        String authorName = resolveAuthorName(callerId, callerName);
        SlipComment saved = commentService.add(slipId, authorId, authorName, request.body());
        return ApiResponse.ok(SlipCommentResponse.from(saved));
    }

    /**
     * 최근 댓글 백필 — SSE 구독 직전 클라이언트 초기 표시. 최근순 정렬.
     *
     * @param limit 1~100 (기본 20)
     */
    @Operation(summary = "슬립 최근 댓글 백필",
            description = "SSE 구독 직전 클라이언트 초기 표시. limit 1~100 (기본 20)")
    @GetMapping
    @RequirePermission(page = "slip.comments", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<List<SlipCommentResponse>> listRecent(
            @PathVariable UUID slipId,
            @RequestParam(defaultValue = "20") int limit) {
        List<SlipCommentResponse> items = commentService.listRecent(slipId, limit).stream()
                .map(SlipCommentResponse::from)
                .toList();
        return ApiResponse.ok(items);
    }

    private UUID resolveAuthorId(String header) {
        if (header == null || header.isBlank()) {
            // SecurityConfig + HeaderAuthenticationFilter 가 X-User-Id 없으면 인증 미발생 → 403.
            // 본 분기는 방어적 (테스트 우회 등) — system 가상 UUID 부여.
            return new UUID(0L, 0L);
        }
        try {
            return UUID.fromString(header);
        } catch (IllegalArgumentException ex) {
            // 잘못된 UUID 헤더 → system 가상 UUID 로 흡수 (audit 만 영향)
            return new UUID(0L, 0L);
        }
    }

    private String resolveAuthorName(String callerId, String header) {
        return ActorDisplayName.resolve(callerId, header);
    }
}
