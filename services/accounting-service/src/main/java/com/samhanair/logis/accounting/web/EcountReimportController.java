package com.samhanair.logis.accounting.web;

import com.samhanair.logis.accounting.service.EcountReimportService;
import com.samhanair.logis.common.ecount.EcountReimportResult;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** MIG-20 — 운영자가 외부 cron에서 호출하는 이카운트 raw 재import trigger. */
@Slf4j
@RestController
@RequestMapping("/admin/ecount/reimport")
@RequiredArgsConstructor
@Tag(name = "MIG-20 — 이카운트 raw 재import")
public class EcountReimportController {

    private static final String PAGE_CODE = "ecount.reimport";
    private static final String ROLE_HEADER = "X-User-Role";

    private final EcountReimportService service;
    private final DynamicPermissionClient dynamicPermissionClient;

    @PostMapping("/{slice}")
    @RequirePermission(page = PAGE_CODE, action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    @Operation(summary = "MIG-20 slice 단위 raw 재import 실행")
    public EcountReimportResult reimport(
            @PathVariable String slice,
            @RequestHeader("X-User-Id") String userId,
            @RequestHeader(value = ROLE_HEADER, required = false) String role) {
        checkEditPermission(role);
        return service.reimportSlice(slice, userId);
    }

    private void checkEditPermission(String actorRole) {
        if (actorRole == null || actorRole.isBlank()) {
            return;
        }
        if (!dynamicPermissionClient.canEdit(actorRole, PAGE_CODE)) {
            log.warn("[MIG-20] raw 재import 동적 권한 차단 — roleCode={} pageCode={}", actorRole, PAGE_CODE);
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "동적 권한 설정에 의해 이카운트 raw 재import 권한이 차단되었습니다.");
        }
    }
}
