package com.samhanair.logis.accounting.web;

import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.accounting.service.Mig7CashDisbursementTransformService;
import com.samhanair.logis.accounting.web.dto.EcountMig7TransformRequest;
import com.samhanair.logis.common.ecount.EcountMig7TransformResult;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** MIG-7 — Admin 지출결의서 staging -> CashDisbursement 변환. */
@Slf4j
@RestController
@RequestMapping("/admin/accounting/cash-disbursements")
@RequiredArgsConstructor
@Tag(name = "MIG-7 — CashDisbursement 변환")
public class Mig7CashDisbursementTransformController {

    private static final String PAGE_CODE = "ecount.mig7.cash-disbursement";
    private static final String ROLE_HEADER = "X-User-Role";

    private final Mig7CashDisbursementTransformService service;
    private final DynamicPermissionClient dynamicPermissionClient;

    @PostMapping("/transform-from-staging")
    @RequirePermission(page = PAGE_CODE, action = "EDIT")
    @Operation(summary = "MIG-7 지출결의서 staging 을 CashDisbursement 로 변환")
    public EcountMig7TransformResult transform(
            @RequestBody(required = false) EcountMig7TransformRequest request,
            @RequestHeader("X-User-Id") String userId,
            @RequestHeader(value = ROLE_HEADER, required = false) String role) {
        checkEditPermission(role);
        return service.transformFromStaging(batchSize(request), userId);
    }

    private void checkEditPermission(String actorRole) {
        if (actorRole == null || actorRole.isBlank()) {
            return;
        }
        boolean canEdit = dynamicPermissionClient.canEdit(actorRole, PAGE_CODE);
        if (!canEdit && dynamicPermissionClient.canView(actorRole, PAGE_CODE)) {
            log.warn("[MIG-7] 동적 권한 차단 — roleCode={} pageCode={}", actorRole, PAGE_CODE);
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "동적 권한 설정에 의해 CashDisbursement transform 권한이 차단되었습니다.");
        }
    }

    private static int batchSize(EcountMig7TransformRequest request) {
        try {
            return request == null ? new EcountMig7TransformRequest(null).normalizedBatchSize()
                    : request.normalizedBatchSize();
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, ex.getMessage(), ex);
        }
    }
}
