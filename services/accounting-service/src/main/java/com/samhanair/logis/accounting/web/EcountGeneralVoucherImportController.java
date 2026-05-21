package com.samhanair.logis.accounting.web;

import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.accounting.service.EcountGeneralVoucherImporter;
import com.samhanair.logis.accounting.web.dto.EcountVoucherImportResult;
import com.samhanair.logis.common.ecount.EcountImportFileValidator;
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

/** MIG-3 — Admin 이카운트 일반전표 CSV import. */
@Slf4j
@RestController
@RequestMapping("/admin/accounting/general-vouchers/imports")
@RequiredArgsConstructor
@Tag(name = "MIG-3 — 이카운트 일반전표 마이그레이션")
public class EcountGeneralVoucherImportController {

    /** Codex BE M6 cycle 2 — MIG-3 일반전표 import 페이지 코드 (SP-D2 동적 권한). */
    private static final String PAGE_CODE = "ecount.mig3.general-voucher";
    private static final String ROLE_HEADER = "X-User-Role";

    private final EcountGeneralVoucherImporter importer;
    private final DynamicPermissionClient dynamicPermissionClient;

    @PostMapping(value = "/ecount", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAnyRole('MASTER', 'MANAGER')")
    @Operation(summary = "이카운트 일반전표 CSV 적재")
    public EcountVoucherImportResult upload(
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
        boolean canEdit = dynamicPermissionClient.canEdit(actorRole, PAGE_CODE);
        if (!canEdit) {
            boolean canView = dynamicPermissionClient.canView(actorRole, PAGE_CODE);
            if (canView) {
                log.warn("[MIG-3] 동적 권한 차단 (view-only override) — roleCode={} pageCode={}", actorRole, PAGE_CODE);
                throw new BusinessException(ErrorCode.FORBIDDEN,
                        "동적 권한 설정에 의해 일반전표 import 권한이 차단되었습니다.");
            }
        }
    }
}
