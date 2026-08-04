package com.samhanair.logis.product.web;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.product.service.EcountProductImporter;
import com.samhanair.logis.product.web.dto.EcountProductImportResult;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.security.permission.PermissionAction;
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

/** MIG-2 — Admin 이카운트 품목/alias CSV import. */
@RestController
@RequestMapping("/admin/products/imports")
@RequiredArgsConstructor
@Tag(name = "MIG-2 — 이카운트 품목 마이그레이션")
public class EcountProductImportController {

    private static final long MAX_SIZE_BYTES = 10L * 1024 * 1024;

    private final EcountProductImporter importer;

    @PostMapping(value = "/ecount", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @RequirePermission(page = "products.ecount-import", action = PermissionAction.CREATE)
    @Operation(summary = "이카운트 품목/품목관계/품목계층그룹 CSV 적재")
    public EcountProductImportResult upload(
            @RequestPart("itemFile") MultipartFile itemFile,
            @RequestPart(value = "relationFile", required = false) MultipartFile relationFile,
            @RequestPart(value = "groupFile", required = false) MultipartFile groupFile,
            @RequestHeader("X-User-Id") String userId) throws IOException {
        validateFile(itemFile, "itemFile");
        validateFileIfPresent(relationFile, "relationFile");
        validateFileIfPresent(groupFile, "groupFile");
        return importer.importCsv(
                itemFile.getInputStream(),
                relationFile == null || relationFile.isEmpty() ? null : relationFile.getInputStream(),
                groupFile == null || groupFile.isEmpty() ? null : groupFile.getInputStream(),
                userId);
    }

    private static void validateFile(MultipartFile file, String partName) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, partName + " CSV 파일 필수");
        }
        validateFileIfPresent(file, partName);
    }

    private static void validateFileIfPresent(MultipartFile file, String partName) throws IOException {
        if (file != null && file.getSize() > MAX_SIZE_BYTES) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    partName + " 파일 크기 한도 초과: " + file.getSize() + " > " + MAX_SIZE_BYTES);
        }
        if (file != null && !file.isEmpty()) {
            byte[] signature = file.getInputStream().readNBytes(4);
            if (signature.length >= 4
                    && signature[0] == 'P' && signature[1] == 'K'
                    && signature[2] == 3 && signature[3] == 4) {
                throw new BusinessException(ErrorCode.MIG2_CSV_HEADER_MISMATCH,
                        partName + "은(는) CSV 파일만 지원합니다. XLSX를 CSV로 변환한 뒤 업로드하십시오.");
            }
        }
    }
}
