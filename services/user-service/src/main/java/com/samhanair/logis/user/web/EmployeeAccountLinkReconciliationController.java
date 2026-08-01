package com.samhanair.logis.user.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.user.service.EmployeeAccountLinkReconciliationService;
import com.samhanair.logis.user.web.dto.EmployeeAccountLinkCandidateRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** 직원 계정 연결의 미리보기와 별도 적용을 제공하는 관리자 API. */
@RestController
@RequiredArgsConstructor
@RequestMapping("/admin/user/employee-account-links")
public class EmployeeAccountLinkReconciliationController {

    private final EmployeeAccountLinkReconciliationService service;

    /** 연결 예정 목록을 저장·반환하며 직원 account_id는 변경하지 않는다. */
    @PostMapping("/preview")
    @RequirePermission(page = "admin.employees", action = PermissionAction.UPDATE)
    public ApiResponse<EmployeeAccountLinkReconciliationService.Preview> preview(
            @Valid @RequestBody @NotEmpty List<@Valid EmployeeAccountLinkCandidateRequest> requests) {
        List<EmployeeAccountLinkReconciliationService.AccountCandidate> candidates = requests.stream()
                .map(request -> new EmployeeAccountLinkReconciliationService.AccountCandidate(
                        request.accountId(), request.fullName(), request.loginId()))
                .toList();
        return ApiResponse.ok(service.preview(candidates));
    }

    /** 사용자가 미리 확인한 계획 키만 적용한다. 응답·로그에는 UUID를 포함하지 않는다. */
    @PostMapping("/{planKey}/apply")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @RequirePermission(page = "admin.employees", action = PermissionAction.UPDATE)
    public void apply(@PathVariable String planKey) {
        service.apply(planKey);
    }
}
