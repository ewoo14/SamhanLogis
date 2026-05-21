package com.samhanair.logis.accounting.web;

import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.accounting.service.Mig10OrderEmployeeBackfillService;
import com.samhanair.logis.accounting.web.dto.EcountMig10BackfillRequest;
import com.samhanair.logis.common.ecount.EcountMig10Result;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** MIG-10 — Order 담당자명 Employee cross-link backfill endpoint. */
@Slf4j
@RestController
@RequestMapping("/admin/accounting/orders")
@RequiredArgsConstructor
@Tag(name = "MIG-10 — Order Employee 연결")
public class Mig10OrderEmployeeBackfillController {

    private static final String PAGE_CODE = "ecount.mig10.order-employee-backfill";
    private static final String ROLE_HEADER = "X-User-Role";

    private final Mig10OrderEmployeeBackfillService service;
    private final DynamicPermissionClient dynamicPermissionClient;

    @PostMapping("/backfill-employee-cross-link")
    @PreAuthorize("hasAnyRole('MASTER', 'MANAGER')")
    @Operation(summary = "MIG-10 Order.manager_name 을 Employee UUID 로 연결")
    public EcountMig10Result backfill(
            @RequestBody(required = false) EcountMig10BackfillRequest request,
            @RequestHeader("X-User-Id") String userId,
            @RequestHeader(value = ROLE_HEADER, required = false) String role) {
        checkEditPermission(role);
        int batchSize = request == null ? 0 : request.normalizedBatchSize();
        return service.backfill(batchSize, userId);
    }

    private void checkEditPermission(String actorRole) {
        if (actorRole == null || actorRole.isBlank()) {
            return;
        }
        boolean canEdit = dynamicPermissionClient.canEdit(actorRole, PAGE_CODE);
        if (!canEdit && dynamicPermissionClient.canView(actorRole, PAGE_CODE)) {
            log.warn("[MIG-10] 동적 권한 차단 — roleCode={} pageCode={}", actorRole, PAGE_CODE);
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "동적 권한 설정에 의해 MIG-10 Order Employee 연결 권한이 차단되었습니다.");
        }
    }
}
