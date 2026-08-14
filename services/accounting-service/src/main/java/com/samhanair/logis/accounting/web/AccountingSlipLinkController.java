package com.samhanair.logis.accounting.web;

import com.samhanair.logis.accounting.service.AccountingSlipEligibility;
import com.samhanair.logis.accounting.service.AccountingSlipLinkReadModel;
import com.samhanair.logis.accounting.service.AccountingSlipLinkReadModelService;
import com.samhanair.logis.accounting.web.dto.AccountingSlipLinkEligibilityResponse;
import com.samhanair.logis.accounting.web.dto.OpaqueUuidDeserializer;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 회계전표 연결 read model/eligibility 운영 경로. 사용자 응답에는 UUID를 반환하지 않는다. */
@RestController
@RequestMapping("/accounting/slip-links")
@RequiredArgsConstructor
public class AccountingSlipLinkController {

    private final AccountingSlipLinkReadModelService readModelService;

    /** 원천 전표 연결 상태와 Q1~Q6 연결 가능 여부를 함께 반환한다. */
    @GetMapping("/eligibility")
    @RequirePermission(page = "accounting.sales-slip.accounting", action = PermissionAction.VIEW)
    public ApiResponse<AccountingSlipLinkEligibilityResponse> eligibility(
            @RequestParam String sourceSlipIdToken,
            @RequestParam String sourceSlipType,
            @RequestParam(defaultValue = "false") boolean dailyAmountVerified,
            Authentication authentication) {
        UUID sourceSlipId = OpaqueUuidDeserializer.decode(sourceSlipIdToken);
        AccountingSlipLinkReadModel readModel = readModelService.read(sourceSlipId, sourceSlipType);
        AccountingSlipEligibility eligibility = AccountingSlipEligibility.evaluate(
                readModel, dailyAmountVerified, roleFromGatewayIdentity(authentication));
        return ApiResponse.ok(AccountingSlipLinkEligibilityResponse.of(readModel, eligibility));
    }

    /**
     * gateway가 JWT를 검증한 뒤 만든 SecurityContext authority만 역할 판정의 근거로 사용한다.
     * X-User-Role 요청 헤더는 읽지 않으므로 호출자가 임의로 붙인 값으로 권한을 올릴 수 없다.
     */
    private static String roleFromGatewayIdentity(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            return null;
        }
        var authorities = authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .collect(java.util.stream.Collectors.toSet());
        if (authorities.contains("SYSTEM_MASTER")
                || authorities.contains("GROUP_00000000-0000-0000-0000-000000000100")) {
            return "MASTER";
        }
        if (authorities.contains("GROUP_00000000-0000-0000-0000-000000000101")) {
            return "MANAGER";
        }
        if (authorities.contains("GROUP_00000000-0000-0000-0000-000000000104")) {
            return "ACCOUNTANT";
        }
        return null;
    }
}
