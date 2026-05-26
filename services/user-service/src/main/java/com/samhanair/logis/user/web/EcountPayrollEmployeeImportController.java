package com.samhanair.logis.user.web;

import com.samhanair.logis.common.ecount.EcountImportFileValidator;
import com.samhanair.logis.common.ecount.EcountMig6ImportResult;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.user.service.EcountPayrollEmployeeImporter;
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

/** MIG-6 — Admin 이카운트 급여관리사원 CSV import. */
@RestController
@RequestMapping("/admin/user/payroll-employees/imports")
@RequiredArgsConstructor
@Tag(name = "MIG-6 — 이카운트 급여관리사원 마이그레이션")
public class EcountPayrollEmployeeImportController {

    private static final String PAGE_CODE = "ecount.mig6.payroll-employee";
    private final EcountPayrollEmployeeImporter importer;

    @PostMapping(value = "/ecount", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @RequirePermission(page = PAGE_CODE, action = "EDIT")
    @Operation(summary = "이카운트 급여관리사원 CSV 적재")
    public EcountMig6ImportResult upload(
            @RequestPart("file") MultipartFile file,
            @RequestHeader("X-User-Id") String userId,
            @RequestHeader(value = "X-User-Role", required = false) String role) throws IOException {
        EcountImportFileValidator.validate(file);
        return importer.importCsv(file.getInputStream(), userId);
    }
}
