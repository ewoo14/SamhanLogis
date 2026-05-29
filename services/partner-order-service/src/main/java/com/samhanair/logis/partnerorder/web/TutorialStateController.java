package com.samhanair.logis.partnerorder.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.partnerorder.service.TutorialStateService;
import com.samhanair.logis.partnerorder.web.dto.TutorialPatchRequest;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.security.permission.PermissionAction;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 튜토리얼 PATCH endpoint (legacy saveTutorialState 9423).
 *
 * <p>M2 partner-auth-service 가 권위, 본 서비스는 mirror — 둘 다 동시 갱신 (PartnerAuthClient
 * fail-soft 후에도 local mirror 는 반영).
 */
@RestController
@RequestMapping("/api/v1/auth/partner-tutorial")
@RequiredArgsConstructor
public class TutorialStateController {

    private static final String PARTNER_CODE_HEADER = "X-Partner-Code";

    private final TutorialStateService tutorialStateService;

    @Operation(summary = "튜토리얼 상태 PATCH",
            description = "M2 proxy + local mirror 동시 갱신")
    @PatchMapping
    @RequirePermission(page = "sales.partner-order.tutorial", action = PermissionAction.UPDATE,
            partnerSelfService = true)
    public ApiResponse<Void> patch(
            @RequestBody TutorialPatchRequest request,
            @RequestHeader(value = PARTNER_CODE_HEADER, required = false) String partnerCode) {
        tutorialStateService.patch(partnerCode, request.completed());
        return ApiResponse.ok(null);
    }
}
