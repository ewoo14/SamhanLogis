package com.samhanair.logis.slip.web.closing;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.slip.dto.closing.CreateSlipClosingBaselineRequest;
import com.samhanair.logis.slip.dto.closing.SlipClosingBaselineResponse;
import com.samhanair.logis.slip.service.closing.SlipClosingBaselineAdminService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 전표 마감 기준선 관리자 API. */
@RestController
@RequestMapping("/admin/slip-closing-baselines")
@RequiredArgsConstructor
public class SlipClosingBaselineAdminController {

    private final SlipClosingBaselineAdminService service;

    @GetMapping
    @RequirePermission(page = SlipClosingPageCodes.ADMIN, action = PermissionAction.VIEW)
    public ApiResponse<List<SlipClosingBaselineResponse>> list() {
        return ApiResponse.ok(service.list());
    }

    @PostMapping
    @RequirePermission(page = SlipClosingPageCodes.ADMIN, action = PermissionAction.CREATE)
    public ApiResponse<SlipClosingBaselineResponse> create(
            @Valid @RequestBody CreateSlipClosingBaselineRequest request) {
        return ApiResponse.ok(service.create(request));
    }

    @DeleteMapping("/{id}")
    @RequirePermission(page = SlipClosingPageCodes.ADMIN, action = PermissionAction.DELETE)
    public ApiResponse<Void> delete(
            @PathVariable UUID id,
            @RequestHeader(value = "X-User-Id", required = false) String callerId) {
        service.delete(id, callerId);
        return ApiResponse.ok(null);
    }
}
