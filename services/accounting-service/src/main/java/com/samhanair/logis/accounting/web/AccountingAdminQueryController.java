package com.samhanair.logis.accounting.web;

import com.samhanair.logis.accounting.service.AccountingAdminQueryService;
import com.samhanair.logis.accounting.web.dto.LedgerStagingResponse;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** MIG-14 admin 원장 대조 조회 endpoint. */
@Slf4j
@RestController
@RequestMapping("/accounting")
@RequiredArgsConstructor
public class AccountingAdminQueryController {

    private static final String LEDGER_PAGE_CODE = "ecount.mig14.ledger";
    private static final String ROLE_HEADER = "X-User-Role";

    private final AccountingAdminQueryService service;
    private final DynamicPermissionClient dynamicPermissionClient;

    @GetMapping("/ledger/sales")
    @RequirePermission(page = LEDGER_PAGE_CODE, action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    @Operation(summary = "MIG-14 이카운트 매출장 staging 조회")
    public ApiResponse<Page<LedgerStagingResponse>> salesLedger(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String partnerName,
            @RequestParam(required = false) String transformStatus,
            @PageableDefault(size = 50)
            Pageable pageable,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        checkViewPermission(LEDGER_PAGE_CODE, roleHeader);
        return ApiResponse.ok(service.listSalesLedger(from, to, partnerName, transformStatus, pageable));
    }

    @GetMapping("/ledger/purchase")
    @RequirePermission(page = LEDGER_PAGE_CODE, action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    @Operation(summary = "MIG-14 이카운트 매입장 staging 조회")
    public ApiResponse<Page<LedgerStagingResponse>> purchaseLedger(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String partnerName,
            @RequestParam(required = false) String transformStatus,
            @PageableDefault(size = 50)
            Pageable pageable,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        checkViewPermission(LEDGER_PAGE_CODE, roleHeader);
        return ApiResponse.ok(service.listPurchaseLedger(from, to, partnerName, transformStatus, pageable));
    }

    private void checkViewPermission(String pageCode, String roleCode) {
        if (roleCode == null || roleCode.isBlank()) {
            return;
        }
        if (!dynamicPermissionClient.canView(roleCode, pageCode)) {
            log.warn("[MIG-14] admin VIEW 동적 권한 차단 — roleCode={} pageCode={}",
                    roleCode, pageCode);
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "동적 권한 설정에 의해 MIG-14 admin 조회 권한이 차단되었습니다.");
        }
    }
}
