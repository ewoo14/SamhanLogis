package com.samhanair.logis.slip.web.preclassify;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.slip.service.preclassify.DispatchExecutionMode;
import com.samhanair.logis.slip.service.preclassify.PreClassifyResponse;
import com.samhanair.logis.slip.service.preclassify.PreClassifyService;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 삼한 Public 가배차 분류 API. */
@RestController
@RequestMapping("/admin/dispatches")
@RequiredArgsConstructor
public class PreClassifyAdminController {
    private final PreClassifyService service;

    @GetMapping("/pre-classify")
    @RequirePermission(page = "dispatch.board", action = PermissionAction.VIEW)
    public ApiResponse<PreClassifyResponse> preClassify(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) DispatchExecutionMode mode) {
        return ApiResponse.ok(service.classify(from, to, mode));
    }
}
