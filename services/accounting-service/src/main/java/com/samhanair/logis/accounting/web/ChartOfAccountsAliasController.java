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
 * 계정과목 alias endpoint — FE 가 사용하는 chart-of-accounts URL.
 * GET /accounting/accounts 와 동일 응답.
 */
@RestController
@RequestMapping("/accounting/chart-of-accounts")
@RequiredArgsConstructor
public class ChartOfAccountsAliasController {

    private final AccountService accountService;

    @Operation(summary = "계정과목 트리 (chart-of-accounts alias)",
            description = "GET /accounting/accounts 와 동등 응답")
    @RequirePermission(page = "accounting.accounts", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    @GetMapping
    public ApiResponse<List<AccountTreeNodeResponse>> tree() {
        return ApiResponse.ok(accountService.findTree());
    }
}
