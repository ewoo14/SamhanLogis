package com.samhanair.logis.user.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.http.HttpHeaderConstants;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.user.repository.EmployeeRepository;
import com.samhanair.logis.user.service.MessengerDirectoryService;
import com.samhanair.logis.user.web.dto.MessengerEmployeeResponse;
import com.samhanair.logis.user.web.dto.MessengerMeResponse;
import com.samhanair.logis.user.web.dto.MessengerPresenceUpdateRequest;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import jakarta.validation.Valid;
import com.samhanair.logis.user.service.MessengerPresenceService;

/** 독립 메신저의 직원 directory와 현재 사용자 표시 계약. */
@RestController
@RequestMapping("/users/messenger")
@RequiredArgsConstructor
public class MessengerDirectoryController {
    private final EmployeeRepository employeeRepository;
    private final MessengerDirectoryService directoryService;
    private final MessengerPresenceService presenceService;

    @GetMapping("/directory")
    @RequirePermission(page = "messenger.send", action = PermissionAction.VIEW)
    public ApiResponse<List<MessengerEmployeeResponse>> directory() {
        List<MessengerEmployeeResponse> result = directoryService.sort(employeeRepository.findAll()).stream()
                .filter(employee -> employee.getTerminationDate() == null)
                .map(employee -> new MessengerEmployeeResponse(
                        employee.getEcountCode(), employee.getFullName(), employee.getPosition(),
                        employee.getDepartment().getName(), "ACTIVE", presenceService.status(employee.getId()).name()))
                .toList();
        return ApiResponse.ok(result);
    }

    @GetMapping("/me")
    @RequirePermission(page = "messenger.send", action = PermissionAction.VIEW)
    public ApiResponse<MessengerMeResponse> me(
            @RequestHeader(HttpHeaderConstants.CALLER_ID_HEADER) String callerId) {
        final UUID userId;
        try {
            userId = UUID.fromString(callerId);
        } catch (Exception ex) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "인증이 필요합니다");
        }
        var employee = employeeRepository.findById(userId)
                .filter(item -> item.getTerminationDate() == null)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "직원을 찾을 수 없습니다"));
        return ApiResponse.ok(new MessengerMeResponse(
                employee.getEcountCode(), employee.getFullName(), employee.getPosition(),
                employee.getDepartment().getName(), "ACTIVE", presenceService.status(userId).name()));
    }

    @PutMapping("/presence/status")
    @RequirePermission(page = "messenger.send", action = PermissionAction.VIEW)
    public ApiResponse<Void> setPresenceStatus(
            @RequestHeader(HttpHeaderConstants.CALLER_ID_HEADER) String callerId,
            @Valid @RequestBody MessengerPresenceUpdateRequest request) {
        UUID userId = parseCaller(callerId);
        try { presenceService.setManualStatus(userId, MessengerPresenceService.PresenceStatus.valueOf(request.status().trim().toUpperCase())); }
        catch (IllegalArgumentException ex) { throw new BusinessException(ErrorCode.INVALID_INPUT, "상태 값이 올바르지 않습니다"); }
        return ApiResponse.ok(null);
    }

    @PostMapping("/presence/sessions/{sessionId}")
    @RequirePermission(page = "messenger.send", action = PermissionAction.VIEW)
    public ApiResponse<Void> joinPresence(@RequestHeader(HttpHeaderConstants.CALLER_ID_HEADER) String callerId, @PathVariable String sessionId) {
        presenceService.join(parseCaller(callerId), sessionId); return ApiResponse.ok(null);
    }

    @DeleteMapping("/presence/sessions/{sessionId}")
    @RequirePermission(page = "messenger.send", action = PermissionAction.VIEW)
    public ApiResponse<Void> leavePresence(@RequestHeader(HttpHeaderConstants.CALLER_ID_HEADER) String callerId, @PathVariable String sessionId) {
        presenceService.leave(parseCaller(callerId), sessionId); return ApiResponse.ok(null);
    }

    private UUID parseCaller(String callerId) {
        try { return UUID.fromString(callerId); }
        catch (Exception ex) { throw new BusinessException(ErrorCode.UNAUTHORIZED, "인증이 필요합니다"); }
    }
}
