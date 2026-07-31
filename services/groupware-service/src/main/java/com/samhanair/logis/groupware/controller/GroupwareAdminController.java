package com.samhanair.logis.groupware.controller;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.http.HttpHeaderConstants;
import com.samhanair.logis.groupware.client.UserClient;
import com.samhanair.logis.approval.ApprovalStatus;
import com.samhanair.logis.groupware.dto.ApprovalDecisionRequest;
import com.samhanair.logis.groupware.dto.ApprovalLineAdminResponse;
import com.samhanair.logis.groupware.dto.ApprovalLineCreateRequest;
import com.samhanair.logis.groupware.dto.ApproverSearchResponse;
import com.samhanair.logis.groupware.dto.MessageResponse;
import com.samhanair.logis.groupware.dto.MessageBulkSendRequest;
import com.samhanair.logis.groupware.dto.MessageBulkSendResponse;
import com.samhanair.logis.groupware.dto.MessageSendRequest;
import com.samhanair.logis.groupware.dto.RecipientSearchResponse;
import com.samhanair.logis.groupware.dto.ScheduleRequest;
import com.samhanair.logis.groupware.dto.ScheduleResponse;
import com.samhanair.logis.groupware.service.ApprovalLineService;
import com.samhanair.logis.groupware.service.MessageService;
import com.samhanair.logis.groupware.service.ScheduleService;
import com.samhanair.logis.security.department.Department;
import com.samhanair.logis.security.department.RequireDepartment;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.data.domain.Page;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 결재선 / 메신저 / 일정 admin endpoint. 인증 = X-User-* 헤더 (gateway 경유) +
 * {@code @RequireDepartment} / {@code @RequirePermission} 권한 가드.
 *
 * <p>신원(identity) 출처 정책 ({@code feedback_identity_header_authz_antipattern}):
 * <ul>
 *   <li>요청자 UUID = {@code X-User-Id} 헤더 — 게이트웨이가 JWT 서명 후 주입.</li>
 *   <li>그룹 UUID 집합 = {@code X-User-Groups} 헤더 — 게이트웨이가 JWT {@code groups} claim 기반 주입.</li>
 *   <li>본문({@code requesterId}/{@code approverId}) 은 UI 편의 전달용이며 서버에서 신뢰하지 않는다.</li>
 * </ul>
 */
@RestController
@RequestMapping("/admin/groupware")
@RequiredArgsConstructor
public class GroupwareAdminController {

    private static final String SCHEDULE_PAGE_CODE = "groupware.schedules";

    private final ApprovalLineService approvalLineService;
    private final MessageService messageService;
    private final ScheduleService scheduleService;
    private final UserClient userClient;

    // ================================ 결재선 ================================

    /** 결재 문서 목록 조회 — 전체 또는 status/requesterId 필터. */
    @Operation(summary = "결재 문서 목록 조회")
    @GetMapping("/approvals")
    @RequirePermission(page = "groupware.approvals", action = PermissionAction.VIEW)
    public ApiResponse<List<ApprovalLineAdminResponse>> listApprovals(
            @RequestParam(required = false) ApprovalStatus status,
            @RequestParam(required = false) UUID requesterId) {
        return ApiResponse.ok(approvalLineService.findAll(status, requesterId));
    }

    /** 결재 문서 상세 조회. */
    @Operation(summary = "결재 문서 상세 조회")
    @GetMapping("/approvals/{approvalId}")
    @RequirePermission(page = "groupware.approvals", action = PermissionAction.VIEW)
    public ApiResponse<ApprovalLineAdminResponse> getApproval(@PathVariable UUID approvalId) {
        return ApiResponse.ok(approvalLineService.findResponseById(approvalId));
    }

    /** 결재 작성 화면의 결재자 검색 proxy. */
    @Operation(summary = "결재자 검색")
    @GetMapping("/approvals/approver-search")
    @RequireDepartment(Department.EXECUTIVE_OFFICE)
    @RequirePermission(page = "groupware.approvals", action = PermissionAction.VIEW)
    public ApiResponse<List<ApproverSearchResponse>> searchApprovers(
            @RequestParam("q") String q,
            @RequestParam(value = "limit", defaultValue = "20") int limit) {
        return ApiResponse.ok(userClient.search(q, limit).stream()
                .map(item -> new ApproverSearchResponse(item.userId(), item.name(), item.department()))
                .toList());
    }

    /**
     * 결재선 생성 + chain 등록.
     *
     * <p>요청자 신원은 {@code X-User-Id} 헤더(게이트웨이 주입)를 사용한다.
     * 본문 {@code requesterId} 는 UI 편의용이며 서버에서 무시한다.
     */
    @Operation(summary = "결재선 생성", description = "MASTER / MANAGER 권한 필요")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "생성 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "검증 실패"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "권한 없음"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "요청자 / 결재자 미존재")
    })
    @PostMapping("/approvals")
    @RequireDepartment(Department.EXECUTIVE_OFFICE)
    @RequirePermission(page = "groupware.approvals", action = PermissionAction.UPDATE)
    public ResponseEntity<ApiResponse<ApprovalLineAdminResponse>> createApproval(
            @RequestHeader(HttpHeaderConstants.CALLER_ID_HEADER) UUID requesterId,
            @Valid @RequestBody ApprovalLineCreateRequest req) {
        var line = approvalLineService.createWithActor(req, requesterId);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(approvalLineService.toResponse(line)));
    }

    /**
     * 결재 승인.
     *
     * <p>수행자 신원은 {@code X-User-Id} 헤더, 그룹 멤버십은 {@code X-User-Groups} 헤더
     * (게이트웨이 주입 comma-join UUID 문자열)를 사용한다. 본문 {@code approverId} 는 무시한다.
     */
    @Operation(summary = "결재 승인")
    @PutMapping("/approvals/{approvalId}/approve")
    @RequireDepartment(Department.EXECUTIVE_OFFICE)
    @RequirePermission(page = "groupware.approvals", action = PermissionAction.UPDATE)
    public ApiResponse<ApprovalLineAdminResponse> approve(
            @PathVariable UUID approvalId,
            @RequestHeader(HttpHeaderConstants.CALLER_ID_HEADER) UUID actorId,
            @RequestHeader(value = HttpHeaderConstants.USER_GROUPS_HEADER, required = false) String groupsHeader,
            @Valid @RequestBody ApprovalDecisionRequest req) {
        Set<UUID> groupIds = parseGroupIds(groupsHeader);
        var line = approvalLineService.approve(approvalId, actorId, groupIds);
        return ApiResponse.ok(approvalLineService.toResponse(line));
    }

    /**
     * 결재 반려.
     *
     * <p>수행자 신원은 {@code X-User-Id} 헤더, 그룹 멤버십은 {@code X-User-Groups} 헤더
     * (게이트웨이 주입 comma-join UUID 문자열)를 사용한다. 본문 {@code approverId} 는 무시한다.
     */
    @Operation(summary = "결재 반려")
    @PutMapping("/approvals/{approvalId}/reject")
    @RequireDepartment(Department.EXECUTIVE_OFFICE)
    @RequirePermission(page = "groupware.approvals", action = PermissionAction.UPDATE)
    public ApiResponse<ApprovalLineAdminResponse> reject(
            @PathVariable UUID approvalId,
            @RequestHeader(HttpHeaderConstants.CALLER_ID_HEADER) UUID actorId,
            @RequestHeader(value = HttpHeaderConstants.USER_GROUPS_HEADER, required = false) String groupsHeader,
            @Valid @RequestBody ApprovalDecisionRequest req) {
        Set<UUID> groupIds = parseGroupIds(groupsHeader);
        var line = approvalLineService.reject(approvalId, actorId, groupIds, req.reason());
        return ApiResponse.ok(approvalLineService.toResponse(line));
    }

    /**
     * {@code X-User-Groups} 헤더 comma-join 문자열을 UUID Set 으로 파싱한다.
     *
     * <p>null/빈 문자열은 빈 Set 으로 처리한다. UUID 형식이 아닌 토큰은 안전하게 무시한다.
     */
    private Set<UUID> parseGroupIds(String groupsHeader) {
        if (groupsHeader == null || groupsHeader.isBlank()) {
            return Set.of();
        }
        return Arrays.stream(groupsHeader.split(","))
                .map(String::trim)
                .filter(s -> !s.isBlank())
                .map(s -> {
                    try {
                        return UUID.fromString(s);
                    } catch (IllegalArgumentException e) {
                        return null;
                    }
                })
                .filter(Objects::nonNull)
                .collect(Collectors.toUnmodifiableSet());
    }

    // ================================ 메신저 ================================

    /** 메신저 단건 발송. 복수 수신은 /messages/bulk를 사용한다. */
    @Operation(summary = "메신저 발송", deprecated = true,
            description = "기존 단건 계약 호환용입니다. 복수 수신은 /messages/bulk를 사용하십시오.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "발송 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "검증 실패")
    })
    @PostMapping("/messages")
    @RequirePermission(page = "messenger.send", action = PermissionAction.CREATE)
    public ResponseEntity<ApiResponse<MessageResponse>> sendMessage(
            @RequestHeader(HttpHeaderConstants.CALLER_ID_HEADER) UUID senderId,
            @Valid @RequestBody MessageSendRequest req) {
        var msg = messageService.send(req, senderId);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(MessageResponse.from(msg)));
    }

    /** 메신저 복수 수신 발송 — 수신자별 1행을 원자적으로 생성한다. */
    @Operation(summary = "메신저 복수 수신 발송")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "발송 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "검증 실패"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "권한 없음"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "수신자 미존재")
    })
    @PostMapping("/messages/bulk")
    @RequirePermission(page = "messenger.send", action = PermissionAction.CREATE)
    public ResponseEntity<ApiResponse<MessageBulkSendResponse>> sendBulkMessage(
            @RequestHeader(HttpHeaderConstants.CALLER_ID_HEADER) UUID senderId,
            @Valid @RequestBody MessageBulkSendRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(messageService.sendBulk(req, senderId)));
    }

    /** 메신저 수신자 검색 — 임원실 부서 제약 없이 재직자만 반환한다. */
    @Operation(summary = "메신저 수신자 검색")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "검색 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "권한 없음")
    })
    @GetMapping("/messages/recipient-search")
    @RequirePermission(page = "messenger.send", action = PermissionAction.VIEW)
    public ApiResponse<List<RecipientSearchResponse>> searchMessageRecipients(
            @RequestParam("q") String q,
            @RequestParam(value = "limit", defaultValue = "20") int limit) {
        return ApiResponse.ok(userClient.search(q, limit, true).stream()
                .map(item -> new RecipientSearchResponse(item.userId(), item.name(), item.department(), item.employeeCode()))
                .toList());
    }

    /** 수신함 — 발송 시각 역순, 50건 단위 페이지. */
    @Operation(summary = "메신저 수신함")
    @GetMapping("/messages/inbox")
    @RequirePermission(page = "messenger.send", action = PermissionAction.VIEW)
    public ResponseEntity<ApiResponse<List<MessageResponse>>> inbox(
            @RequestHeader(HttpHeaderConstants.CALLER_ID_HEADER) UUID recipientId,
            @RequestParam(required = false) UUID userId,
            @RequestParam(required = false, defaultValue = "0") int page) {
        // 객체수준 인가: userId 쿼리는 구버전 클라이언트 호환용으로만 받으며 조회 범위는 항상 호출자 본인이다.
        int safePage = Math.max(page, 0);
        Page<MessageResponse> inbox = messageService.inboxPageResponses(
                recipientId, org.springframework.data.domain.PageRequest.of(safePage, 50));
        return ResponseEntity.ok()
                .header("X-Has-Next-Page", Boolean.toString(inbox.hasNext()))
                .body(ApiResponse.ok(inbox.getContent()));
    }

    /**
     * 메신저 읽음 처리. 호출자 신원은 게이트웨이가 주입한 {@code X-User-Id} 헤더만 사용한다.
     * MessageService가 메시지 수신자와 호출자를 비교하므로 타인 수신 건은 403으로 거부한다.
     * 이미 READ인 메시지는 도메인 멱등 가드가 같은 상태와 시각을 유지한다.
     */
    @Operation(summary = "메신저 읽음 처리")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "읽음 처리 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "수신자 본인 아님"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "메시지 미존재")
    })
    @PutMapping("/messages/{messageId}/read")
    @RequirePermission(page = "messenger.send", action = PermissionAction.VIEW)
    public ApiResponse<MessageResponse> markMessageRead(
            @PathVariable UUID messageId,
            @RequestHeader(HttpHeaderConstants.CALLER_ID_HEADER) UUID actorId) {
        return ApiResponse.ok(MessageResponse.from(messageService.markRead(messageId, actorId)));
    }

    // ================================ 일정 ================================

    /** 일정 등록. */
    @Operation(summary = "일정 등록")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "등록 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "시간 검증 실패"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "소유자 / 참여자 미존재")
    })
    @PostMapping("/schedules")
    @RequirePermission(page = SCHEDULE_PAGE_CODE, action = PermissionAction.CREATE)
    public ResponseEntity<ApiResponse<ScheduleResponse>> createSchedule(
            @RequestHeader(HttpHeaderConstants.CALLER_ID_HEADER) UUID ownerId,
            @Valid @RequestBody ScheduleRequest req) {
        var schedule = scheduleService.create(req, ownerId);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(ScheduleResponse.from(schedule)));
    }

    /** 일정 조회 (소유자 + 기간). */
    @Operation(summary = "일정 조회 (소유자 + 기간)")
    @GetMapping("/schedules")
    @RequirePermission(page = SCHEDULE_PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<List<ScheduleResponse>> findSchedules(
            @RequestHeader(HttpHeaderConstants.CALLER_ID_HEADER) UUID ownerId,
            @RequestParam(required = false, name = "ownerId") UUID ignoredOwnerId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to) {
        // 객체수준 인가: ownerId 쿼리는 구버전 클라이언트 호환용으로만 받으며 조회 범위는 항상 호출자 본인이다.
        var schedules = scheduleService.findInRange(ownerId, from, to);
        return ApiResponse.ok(schedules.stream().map(ScheduleResponse::from).toList());
    }

    /** 일정 단건 상세 조회. 호출자가 활성 대상자인 일정만 반환한다. */
    @Operation(summary = "일정 단건 상세 조회")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "일정 미존재 또는 조회 권한 없음")
    })
    @GetMapping("/schedules/{scheduleId}")
    @RequirePermission(page = SCHEDULE_PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<ScheduleResponse> findSchedule(
            @PathVariable UUID scheduleId,
            @RequestHeader(HttpHeaderConstants.CALLER_ID_HEADER) UUID actorUserId) {
        return ApiResponse.ok(ScheduleResponse.from(scheduleService.findVisibleById(scheduleId, actorUserId)));
    }

    /** 일정 수정. */
    @Operation(summary = "일정 수정")
    @PutMapping("/schedules/{scheduleId}")
    @RequirePermission(page = SCHEDULE_PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<ScheduleResponse> updateSchedule(@PathVariable UUID scheduleId,
                                                        @RequestHeader(HttpHeaderConstants.CALLER_ID_HEADER) UUID ownerId,
                                                        @Valid @RequestBody ScheduleRequest req) {
        var schedule = scheduleService.update(scheduleId, req, ownerId);
        return ApiResponse.ok(ScheduleResponse.from(schedule));
    }

    /** 일정 삭제 (soft). */
    @Operation(summary = "일정 삭제 (soft)")
    @DeleteMapping("/schedules/{scheduleId}")
    @RequirePermission(page = SCHEDULE_PAGE_CODE, action = PermissionAction.DELETE)
    public ResponseEntity<ApiResponse<Void>> deleteSchedule(
            @PathVariable UUID scheduleId,
            @RequestHeader(HttpHeaderConstants.CALLER_ID_HEADER) UUID actorUserId) {
        scheduleService.delete(scheduleId, actorUserId);
        return ResponseEntity.ok(ApiResponse.ok(null));
    }
}
