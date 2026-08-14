package com.samhanair.logis.accounting.web;

import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.accounting.service.EcountTaxInvoiceImporter;
import com.samhanair.logis.accounting.web.dto.EcountMig4ImportResult;
import com.samhanair.logis.common.ecount.EcountImportFileValidator;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.io.IOException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** MIG-4 — Admin 이카운트 세금계산서용 출고전표 CSV import. */
@Slf4j
@RestController
@RequestMapping("/admin/accounting/tax-invoices/imports")
@RequiredArgsConstructor
@Tag(name = "MIG-4 — 이카운트 세금계산서 마이그레이션")
public class EcountTaxInvoiceImportController {

    private static final String PAGE_CODE = "ecount.mig4.tax-invoice";
    private static final String ROLE_HEADER = "X-User-Role";

    private final EcountTaxInvoiceImporter importer;
    private final DynamicPermissionClient dynamicPermissionClient;

    @PostMapping(value = "/ecount", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @RequirePermission(page = PAGE_CODE, action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    @Operation(summary = "이카운트 세금계산서용 출고전표 CSV 적재")
    public EcountMig4ImportResult upload(
            @RequestPart("file") MultipartFile file,
            @RequestHeader("X-User-Id") String userId,
            @RequestHeader(value = ROLE_HEADER, required = false) String role) throws IOException {
        EcountImportFileValidator.validate(file);
        checkEditPermission(role);
        return importer.importCsv(file.getInputStream(), userId);
    }

    private void checkEditPermission(String actorRole) {
        if (actorRole == null || actorRole.isBlank()) {
            return;
        }
        if (!dynamicPermissionClient.canEdit(actorRole, PAGE_CODE)
                && dynamicPermissionClient.canView(actorRole, PAGE_CODE)) {
            log.warn("[MIG-4] 동적 권한 차단 — roleCode={} pageCode={}", actorRole, PAGE_CODE);
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "동적 권한 설정에 의해 세금계산서 import 권한이 차단되었습니다.");
        }
    }
}
