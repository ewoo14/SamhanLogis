package com.samhanair.logis.user.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.user.service.OrgChartService;
import com.samhanair.logis.user.web.dto.OrgChartResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 직원 PII 를 포함하는 조직도 projection. 직원관리 VIEW 권한이 있는 호출자만 조회한다. */
@RestController
@RequestMapping("/users/org-chart")
@RequiredArgsConstructor
public class OrgChartController {

    private final OrgChartService orgChartService;

    @GetMapping
    @RequirePermission(page = "admin.employees", action = PermissionAction.VIEW)
    public ApiResponse<OrgChartResponse> get() {
        return ApiResponse.ok(orgChartService.getOrgChart());
    }
}
