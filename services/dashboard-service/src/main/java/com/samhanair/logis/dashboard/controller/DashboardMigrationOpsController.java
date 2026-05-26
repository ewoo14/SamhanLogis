package com.samhanair.logis.dashboard.controller;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.dashboard.dto.EcountMigOpsDashboardResponse;
import com.samhanair.logis.dashboard.service.EcountMigOpsDashboardService;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** MIG-21 /api/v1/dashboard/ecount-mig gateway route target. */
@RestController
@RequestMapping("/dashboard")
@RequiredArgsConstructor
public class DashboardMigrationOpsController {

    private final EcountMigOpsDashboardService service;

    @Operation(summary = "이카운트 마이그레이션 운영 대시보드")
    @GetMapping("/ecount-mig")
    @RequirePermission(page = "ecount.mig.ops-dashboard", action = "VIEW")
    public ApiResponse<EcountMigOpsDashboardResponse> ecountMigOps() {
        return ApiResponse.ok(service.load());
    }
}
