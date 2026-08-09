package com.samhanair.logis.partner.controller;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partner.dto.EcountPartnerImportResult;
import com.samhanair.logis.partner.dto.EcountPartnerRejectionPage;
import com.samhanair.logis.partner.service.EcountPartnerImporter;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.security.permission.PermissionAction;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.io.IOException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * MIG-1 PoC — Admin 콘솔에서 이카운트 거래처 CSV 적재.
 *
 * <p>spec: docs/superpowers/specs/2026-05-19-ecount-mig-1-partner-design.md (D-MIG-1-11, D-MIG-1-12).
 * 권한: ROLE_MASTER + ROLE_MANAGER (대량 운영 데이터 + 신용한도 노출 → DISPATCH 차단).
 * 동기 실행 (7천 건 ~30초 예상, multipart size limit 10 MB).
 */
@RestController
@RequestMapping("/admin/partners/imports")
@RequiredArgsConstructor
@Tag(name = "MIG-1 — 이카운트 거래처 일괄 적재 (Admin)",
        description = "이카운트 ERP 거래처 Excel 다운로드 CSV (17 컬럼) 를 staging + partners 에 멱등 적재")
public class EcountPartnerImportController {

    private static final long MAX_SIZE_BYTES = 10L * 1024 * 1024; // 10 MB

    private final EcountPartnerImporter importer;

    /**
     * 이카운트 거래처 CSV 업로드 → staging + partner 적재.
     *
     * @param file CSV multipart file (UTF-8 또는 MS949, 17 컬럼, 첫 행 메타데이터)
     * @param userId 작업자 user id (X-User-Id)
     * @return 분류 결과 (신규/갱신/거부/스킵 + ACTIVE/SUSPENDED 분포 + sample reject)
     */
    @PostMapping(value = "/ecount", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @RequirePermission(page = "partners.edit", action = PermissionAction.CREATE)
    @Operation(summary = "이카운트 거래처 CSV 적재",
            description = "MIG-1 PoC — 이카운트 export 17 컬럼 → staging.ecount_partner_raw + partners. "
                    + "동일 파일 재실행 시 멱등 (source_file_hash 기준).")
    public EcountPartnerImportResult uploadEcountPartnerCsv(
            @RequestPart("file") MultipartFile file,
            @RequestHeader("X-User-Id") String userId) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "CSV 파일 필수");
        }
        if (file.getSize() > MAX_SIZE_BYTES) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "파일 크기 한도 초과: " + file.getSize() + " > " + MAX_SIZE_BYTES);
        }
        return importer.importCsv(file.getInputStream(), userId);
    }

    /** 이카운트 거래처등록 XLSX 정본을 실제 staging + partners 경로로 적재한다. */
    @PostMapping(value = "/ecount-xlsx", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @RequirePermission(page = "partners.edit", action = PermissionAction.CREATE)
    @Operation(summary = "이카운트 거래처등록 XLSX 적재",
            description = "거래처등록.xlsx 16컬럼 정본을 partner_code 멱등 키로 적재한다. trailer와 파싱 실패 행은 보류한다.")
    public EcountPartnerImportResult uploadEcountPartnerXlsx(
            @RequestPart("file") MultipartFile file,
            @RequestHeader("X-User-Id") String userId) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "XLSX 파일 필수");
        }
        if (file.getSize() > MAX_SIZE_BYTES) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "파일 크기 한도 초과: " + file.getSize() + " > " + MAX_SIZE_BYTES);
        }
        return importer.importXlsx(file.getInputStream(), userId);
    }

    /** 대량 거부·보류 행을 페이지 단위로 조회한다. */
    @GetMapping("/ecount/rejections")
    @RequirePermission(page = "partners.edit", action = PermissionAction.VIEW)
    @Operation(summary = "이카운트 거부·보류 행 페이지 조회",
            description = "import 응답의 sourceFileHash로 전체 행을 페이지 조회한다. 최대 100행.")
    public EcountPartnerRejectionPage findRejections(
            @RequestParam String sourceFileHash,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return importer.findRejectionPage(sourceFileHash, page, size);
    }
}
