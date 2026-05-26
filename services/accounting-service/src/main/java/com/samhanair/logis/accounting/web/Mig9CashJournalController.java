package com.samhanair.logis.accounting.web;

import com.samhanair.logis.accounting.service.Mig9AgingSnapshotRefreshService;
import com.samhanair.logis.accounting.service.Mig9CashJournalService;
import com.samhanair.logis.accounting.web.dto.AgingSnapshotRefreshResult;
import com.samhanair.logis.accounting.web.dto.EcountMig9JournalRequest;
import com.samhanair.logis.common.ecount.EcountMig9JournalResult;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** MIG-9 — CashDisbursement/CashReceipt -> Journal 자동 생성 및 aging snapshot refresh. */
@Slf4j
@RestController
@RequestMapping("/admin/accounting")
@RequiredArgsConstructor
@Tag(name = "MIG-9 — Cash Journal 자동 생성")
public class Mig9CashJournalController {

    private static final String PAGE_DISBURSEMENT = "ecount.mig9.cash-journal.disbursement";
    private static final String PAGE_RECEIPT = "ecount.mig9.cash-journal.receipt";
    private static final String PAGE_AGING_SNAPSHOT = "ecount.mig14.aging-snapshot";
    private static final String ROLE_HEADER = "X-User-Role";

    private final Mig9CashJournalService cashJournalService;
    private final Mig9AgingSnapshotRefreshService agingSnapshotRefreshService;
    private final DynamicPermissionClient dynamicPermissionClient;

    @PostMapping("/cash-journals/generate-from-disbursements")
    @RequirePermission(page = PAGE_DISBURSEMENT, action = "EDIT")
    @Operation(summary = "MIG-9 지출결의서 CashDisbursement 를 Journal 로 자동 생성")
    public EcountMig9JournalResult generateFromDisbursements(
            @RequestBody(required = false) EcountMig9JournalRequest request,
            @RequestHeader("X-User-Id") String userId,
            @RequestHeader(value = ROLE_HEADER, required = false) String role) {
        checkEditPermission(role, PAGE_DISBURSEMENT);
        return cashJournalService.generateFromDisbursements(batchSize(request), userId);
    }

    @PostMapping("/cash-journals/generate-from-receipts")
    @RequirePermission(page = PAGE_RECEIPT, action = "EDIT")
    @Operation(summary = "MIG-9 입금보고서 CashReceipt 를 Journal 로 자동 생성")
    public EcountMig9JournalResult generateFromReceipts(
            @RequestBody(required = false) EcountMig9JournalRequest request,
            @RequestHeader("X-User-Id") String userId,
            @RequestHeader(value = ROLE_HEADER, required = false) String role) {
        checkEditPermission(role, PAGE_RECEIPT);
        return cashJournalService.generateFromReceipts(batchSize(request), userId);
    }

    @PostMapping("/aging-snapshot/refresh")
    @RequirePermission(page = PAGE_AGING_SNAPSHOT, action = "EDIT")
    @Operation(summary = "MIG-9 partner_aging_snapshot MATERIALIZED VIEW refresh")
    public AgingSnapshotRefreshResult refreshAgingSnapshot(
            @RequestBody(required = false) EcountMig9JournalRequest ignored,
            @RequestHeader("X-User-Id") String userId,
            @RequestHeader(value = ROLE_HEADER, required = false) String role) {
        checkRefreshEditPermission(role);
        agingSnapshotRefreshService.refresh();
        return new AgingSnapshotRefreshResult(LocalDateTime.now(), "REFRESHED");
    }

    private void checkEditPermission(String actorRole, String pageCode) {
        if (actorRole == null || actorRole.isBlank()) {
            return;
        }
        boolean canEdit = dynamicPermissionClient.canEdit(actorRole, pageCode);
        if (!canEdit && dynamicPermissionClient.canView(actorRole, pageCode)) {
            log.warn("[MIG-9] 동적 권한 차단 — roleCode={} pageCode={}", actorRole, pageCode);
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "동적 권한 설정에 의해 MIG-9 Cash Journal 생성 권한이 차단되었습니다.");
        }
    }

    private void checkRefreshEditPermission(String actorRole) {
        if (actorRole == null || actorRole.isBlank()) {
            return;
        }
        if (!dynamicPermissionClient.canEdit(actorRole, PAGE_AGING_SNAPSHOT)) {
            log.warn("[MIG-14] AgingSnapshot refresh 동적 권한 차단 — roleCode={} pageCode={}",
                    actorRole, PAGE_AGING_SNAPSHOT);
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "동적 권한 설정에 의해 MIG-14 AgingSnapshot 새로고침 권한이 차단되었습니다.");
        }
    }

    private static int batchSize(EcountMig9JournalRequest request) {
        try {
            return request == null ? new EcountMig9JournalRequest(null).normalizedBatchSize()
                    : request.normalizedBatchSize();
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, ex.getMessage(), ex);
        }
    }
}
