package com.samhanair.logis.inventory.web;

import com.samhanair.logis.common.ecount.EcountImportFileValidator;
import com.samhanair.logis.common.ecount.EcountMig5ImportResult;
import com.samhanair.logis.inventory.service.EcountStockTransferImporter;
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

/** MIG-5 Admin 이카운트 재고이동 CSV import. */
@RestController
@RequestMapping("/admin/inventory/stock-transfers/imports")
@RequiredArgsConstructor
@Tag(name = "MIG-5 이카운트 재고이동 마이그레이션")
public class EcountStockTransferImportController {

    private final EcountStockTransferImporter importer;

    @PostMapping(value = "/ecount", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @RequirePermission(page = "ecount.import.inventory", action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    @Operation(summary = "이카운트 재고이동 CSV 적재")
    public EcountMig5ImportResult upload(
            @RequestPart("file") MultipartFile file,
            @RequestHeader("X-User-Id") String userId) throws IOException {
        EcountImportFileValidator.validate(file);
        return importer.importCsv(file.getInputStream(), userId);
    }
}
