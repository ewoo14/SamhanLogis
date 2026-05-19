package com.samhanair.logis.product.web;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.product.service.EcountProductImporter;
import com.samhanair.logis.product.web.dto.EcountProductImportResult;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.io.IOException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
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
    @PreAuthorize("hasAnyRole('MASTER', 'MANAGER')")
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

    private static void validateFile(MultipartFile file, String partName) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, partName + " CSV 파일 필수");
        }
        validateFileIfPresent(file, partName);
    }

    private static void validateFileIfPresent(MultipartFile file, String partName) {
        if (file != null && file.getSize() > MAX_SIZE_BYTES) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    partName + " 파일 크기 한도 초과: " + file.getSize() + " > " + MAX_SIZE_BYTES);
        }
    }
}
