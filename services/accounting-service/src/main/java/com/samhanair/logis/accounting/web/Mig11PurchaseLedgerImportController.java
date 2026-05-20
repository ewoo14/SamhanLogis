package com.samhanair.logis.accounting.web;

import com.samhanair.logis.accounting.client.DynamicPermissionClient;
import com.samhanair.logis.accounting.service.EcountPurchaseLedgerImporter;
import com.samhanair.logis.common.ecount.EcountImportFileValidator;
import com.samhanair.logis.common.ecount.EcountMig11Result;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.io.IOException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** MIG-11 — Admin 이카운트 매입장 XLSX import. */
@Slf4j
@RestController
@RequestMapping("/admin/accounting/purchase-ledger/imports")
@RequiredArgsConstructor
@Tag(name = "MIG-11 — 이카운트 매입장 마이그레이션")
public class Mig11PurchaseLedgerImportController {

    private static final String PAGE_CODE = "ecount.mig11.purchase-ledger";
    private static final String ROLE_HEADER = "X-User-Role";

    private final EcountPurchaseLedgerImporter importer;
    private final DynamicPermissionClient dynamicPermissionClient;

    @PostMapping(value = "/ecount", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAnyRole('MASTER', 'MANAGER')")
    @Operation(summary = "이카운트 매입장 XLSX 적재 + DailyClosing 대조")
    public EcountMig11Result upload(
            @RequestPart("file") MultipartFile file,
            @RequestHeader("X-User-Id") String userId,
            @RequestHeader(value = ROLE_HEADER, required = false) String role) throws IOException {
        EcountImportFileValidator.validateXlsx(file);
        checkEditPermission(role);
        return importer.importXlsx(file.getInputStream(), userId);
    }

    private void checkEditPermission(String actorRole) {
        if (actorRole == null || actorRole.isBlank()) {
            return;
        }
        boolean canEdit = dynamicPermissionClient.canEdit(actorRole, PAGE_CODE);
        if (!canEdit && dynamicPermissionClient.canView(actorRole, PAGE_CODE)) {
            log.warn("[MIG-11] 동적 권한 차단 — roleCode={} pageCode={}", actorRole, PAGE_CODE);
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "동적 권한 설정에 의해 매입장 import 권한이 차단되었습니다.");
        }
    }
}
