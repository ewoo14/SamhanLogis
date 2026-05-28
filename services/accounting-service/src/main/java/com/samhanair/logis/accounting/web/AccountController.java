package com.samhanair.logis.accounting.web;

import com.samhanair.logis.accounting.service.AccountService;
import com.samhanair.logis.accounting.web.dto.AccountTreeNodeResponse;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 계정과목 마스터 endpoint (Plan §4).
 *
 * <p>권한 매트릭스:
 * <ul>
 *   <li>GET /accounting/accounts — 인증된 모든 사용자 (트리 전체 조회)</li>
 * </ul>
 */
@RestController
@RequestMapping("/accounting/accounts")
@RequiredArgsConstructor
public class AccountController {

    private final AccountService accountService;

    /** 계정과목 트리 전체 조회 — code 오름차순. */
    @Operation(summary = "계정과목 트리", description = "ChartOfAccount 전체를 code asc 로 조회 (FE 가 parentCode 로 nest)")
    @RequirePermission(page = "accounting.accounts", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    @GetMapping
    public ApiResponse<List<AccountTreeNodeResponse>> tree() {
        return ApiResponse.ok(accountService.findTree());
    }

}
