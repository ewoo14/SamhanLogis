package com.samhanair.logis.accounting.web;

import com.samhanair.logis.accounting.service.EcountGeneralVoucherImporter;
import com.samhanair.logis.accounting.web.dto.EcountVoucherImportResult;
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

/** MIG-3 — Admin 이카운트 일반전표 CSV import. */
@RestController
@RequestMapping("/admin/accounting/general-vouchers/imports")
@RequiredArgsConstructor
@Tag(name = "MIG-3 — 이카운트 일반전표 마이그레이션")
public class EcountGeneralVoucherImportController {

    private final EcountGeneralVoucherImporter importer;

    @PostMapping(value = "/ecount", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAnyRole('MASTER', 'MANAGER')")
    @Operation(summary = "이카운트 일반전표 CSV 적재")
    public EcountVoucherImportResult upload(
            @RequestPart("file") MultipartFile file,
            @RequestHeader("X-User-Id") String userId) throws IOException {
        EcountImportFileValidator.validate(file);
        return importer.importCsv(file.getInputStream(), userId);
    }
}
