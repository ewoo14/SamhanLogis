package com.samhanair.logis.groupware.controller;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.groupware.dto.ApprovalDecisionRequest;
import com.samhanair.logis.groupware.dto.ApprovalLineAdminResponse;
import com.samhanair.logis.groupware.dto.ApprovalLineCreateRequest;
import com.samhanair.logis.groupware.dto.MessageResponse;
import com.samhanair.logis.groupware.dto.MessageSendRequest;
import com.samhanair.logis.groupware.dto.ScheduleRequest;
import com.samhanair.logis.groupware.dto.ScheduleResponse;
import com.samhanair.logis.groupware.service.ApprovalLineService;
import com.samhanair.logis.groupware.service.MessageService;
import com.samhanair.logis.groupware.service.ScheduleService;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.security.Principal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 결재선 / 메신저 / 일정 admin endpoint. 인증 = X-User-* 헤더 (gateway 경유) +
 * {@code @PreAuthorize} 권한 가드 (MASTER / MANAGER 등).
 */
@RestController
@RequestMapping("/admin/groupware")
@RequiredArgsConstructor
public class GroupwareAdminController {

    private final ApprovalLineService approvalLineService;
    private final MessageService messageService;
    private final ScheduleService scheduleService;

    // ================================ 결재선 ================================

    /** 결재선 생성 + chain 등록. */
    @Operation(summary = "결재선 생성", description = "MASTER / MANAGER 권한 필요")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "생성 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "검증 실패"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "권한 없음"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "요청자 / 결재자 미존재")
    })
    @PostMapping("/approvals")
    @PreAuthorize("@hr.isExecutiveOffice()")
    @RequirePermission(page = "messenger.admin", action = "EDIT")
    public ResponseEntity<ApiResponse<ApprovalLineAdminResponse>> createApproval(
            @Valid @RequestBody ApprovalLineCreateRequest req) {
        var line = approvalLineService.create(req);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(ApprovalLineAdminResponse.from(line)));
    }

    /** 결재 승인. */
    @Operation(summary = "결재 승인")
    @PutMapping("/approvals/{approvalId}/approve")
    @PreAuthorize("@hr.isExecutiveOffice()")
    @RequirePermission(page = "messenger.admin", action = "EDIT")
    public ApiResponse<ApprovalLineAdminResponse> approve(@PathVariable UUID approvalId,
                                                          @Valid @RequestBody ApprovalDecisionRequest req) {
        var line = approvalLineService.approve(approvalId, req.approverId());
        return ApiResponse.ok(ApprovalLineAdminResponse.from(line));
    }

    /** 결재 반려. */
    @Operation(summary = "결재 반려")
    @PutMapping("/approvals/{approvalId}/reject")
    @PreAuthorize("@hr.isExecutiveOffice()")
    @RequirePermission(page = "messenger.admin", action = "EDIT")
    public ApiResponse<ApprovalLineAdminResponse> reject(@PathVariable UUID approvalId,
                                                         @Valid @RequestBody ApprovalDecisionRequest req) {
        var line = approvalLineService.reject(approvalId, req.approverId(), req.reason());
        return ApiResponse.ok(ApprovalLineAdminResponse.from(line));
    }

    // ================================ 메신저 ================================

    /** 메신저 발송. */
    @Operation(summary = "메신저 발송")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "발송 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "검증 실패")
    })
    @PostMapping("/messages")
    @RequirePermission(page = "messenger.send", action = "EDIT")
    public ResponseEntity<ApiResponse<MessageResponse>> sendMessage(@Valid @RequestBody MessageSendRequest req) {
        var msg = messageService.send(req);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(MessageResponse.from(msg)));
    }

    /** 수신함 — 발송 시각 역순. */
    @Operation(summary = "메신저 수신함")
    @GetMapping("/messages/inbox")
    @RequirePermission(page = "messenger.send", action = "VIEW")
    public ApiResponse<List<MessageResponse>> inbox(@RequestParam UUID userId) {
        var page = messageService.inbox(userId, org.springframework.data.domain.PageRequest.of(0, 50));
        return ApiResponse.ok(page.map(MessageResponse::from).getContent());
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
    @RequirePermission(page = "messenger.send", action = "EDIT")
    public ResponseEntity<ApiResponse<ScheduleResponse>> createSchedule(@Valid @RequestBody ScheduleRequest req) {
        var schedule = scheduleService.create(req);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(ScheduleResponse.from(schedule)));
    }

    /** 일정 조회 (소유자 + 기간). */
    @Operation(summary = "일정 조회 (소유자 + 기간)")
    @GetMapping("/schedules")
    @RequirePermission(page = "messenger.send", action = "VIEW")
    public ApiResponse<List<ScheduleResponse>> findSchedules(
            @RequestParam UUID ownerId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to) {
        var schedules = scheduleService.findInRange(ownerId, from, to);
        return ApiResponse.ok(schedules.stream().map(ScheduleResponse::from).toList());
    }

    /** 일정 수정. */
    @Operation(summary = "일정 수정")
    @PutMapping("/schedules/{scheduleId}")
    @RequirePermission(page = "messenger.send", action = "EDIT")
    public ApiResponse<ScheduleResponse> updateSchedule(@PathVariable UUID scheduleId,
                                                        @Valid @RequestBody ScheduleRequest req) {
        var schedule = scheduleService.update(scheduleId, req);
        return ApiResponse.ok(ScheduleResponse.from(schedule));
    }

    /** 일정 삭제 (soft). */
    @Operation(summary = "일정 삭제 (soft)")
    @DeleteMapping("/schedules/{scheduleId}")
    @RequirePermission(page = "messenger.admin", action = "EDIT")
    public ResponseEntity<ApiResponse<Void>> deleteSchedule(@PathVariable UUID scheduleId, Principal principal) {
        String actor = principal != null ? principal.getName() : "system";
        scheduleService.delete(scheduleId, actor);
        return ResponseEntity.ok(ApiResponse.ok(null));
    }
}
