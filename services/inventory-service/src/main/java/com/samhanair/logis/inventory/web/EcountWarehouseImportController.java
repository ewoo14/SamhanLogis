package com.samhanair.logis.inventory.web;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.inventory.service.EcountWarehouseImporter;
import com.samhanair.logis.inventory.web.dto.EcountWarehouseImportResult;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.io.IOException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** MIG-2 — Admin 이카운트 창고 CSV import. */
@RestController
@RequestMapping("/admin/warehouses/imports")
@RequiredArgsConstructor
@Tag(name = "MIG-2 — 이카운트 창고 마이그레이션")
public class EcountWarehouseImportController {

    private static final long MAX_SIZE_BYTES = 10L * 1024 * 1024;
    private final EcountWarehouseImporter importer;

    @PostMapping(value = "/ecount", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @RequirePermission(page = "ecount.import.inventory", action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    @Operation(summary = "이카운트 창고 CSV 적재")
    public EcountWarehouseImportResult upload(
            @RequestPart("file") MultipartFile file,
            @RequestHeader("X-User-Id") String userId) throws IOException {
        validateFile(file);
        return importer.importCsv(file.getInputStream(), userId);
    }

    private static void validateFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "CSV 파일 필수");
        }
        if (file.getSize() > MAX_SIZE_BYTES) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "파일 크기 한도 초과: " + file.getSize() + " > " + MAX_SIZE_BYTES);
        }
    }
}
