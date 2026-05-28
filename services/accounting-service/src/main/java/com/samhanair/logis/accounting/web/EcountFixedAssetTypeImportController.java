package com.samhanair.logis.accounting.web;

import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.accounting.service.EcountFixedAssetTypeImporter;
import com.samhanair.logis.common.ecount.EcountImportFileValidator;
import com.samhanair.logis.common.ecount.EcountMig6ImportResult;
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

/** MIG-6 — Admin 이카운트 고정자산유형 CSV import. */
@Slf4j
@RestController
@RequestMapping("/admin/accounting/fixed-asset-types/imports")
@RequiredArgsConstructor
@Tag(name = "MIG-6 — 이카운트 고정자산유형 마이그레이션")
public class EcountFixedAssetTypeImportController {

    private static final String PAGE_CODE = "ecount.mig6.fixed-asset-type";
    private static final String ROLE_HEADER = "X-User-Role";

    private final EcountFixedAssetTypeImporter importer;
    private final DynamicPermissionClient dynamicPermissionClient;

    @PostMapping(value = "/ecount", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @RequirePermission(page = PAGE_CODE, action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    @Operation(summary = "이카운트 고정자산유형 CSV 적재")
    public EcountMig6ImportResult upload(
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
        if (!canEdit && dynamicPermissionClient.canView(actorRole, PAGE_CODE)) {
            log.warn("[MIG-6] 동적 권한 차단 — roleCode={} pageCode={}", actorRole, PAGE_CODE);
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "동적 권한 설정에 의해 고정자산유형 import 권한이 차단되었습니다.");
        }
    }
}
