package com.samhanair.logis.dcconfig.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.dcconfig.dto.DcConfigImportResult;
import com.samhanair.logis.dcconfig.service.DcConfigImportService;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import java.io.IOException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * DC 거래처 할인 정보 CSV import 컨트롤러 (PR-D Part 2-2).
 *
 * <p>Samhan Public Notion 에서 다운받은 "거래처 DC정보" CSV (221 거래처) 일괄 import.
 *
 * <p>접근 제어:
 * <ul>
 *   <li>{@code MASTER} role 만 호출 가능 ({@code @PreAuthorize})</li>
 *   <li>Gateway 가 주입한 {@code X-User-Role} 헤더를 {@code HeaderAuthenticationFilter} 가 신뢰</li>
 * </ul>
 *
 * <p>UUID 비공개 — 응답에는 partner_code / 업체명 만 노출하며 partner UUID 는 노출하지 않는다.
 */
@RestController
@RequestMapping("/api/v1/dc-config/admin")
@RequiredArgsConstructor
public class DcConfigImportController {

    private final DcConfigImportService dcConfigImportService;

    /**
     * Notion CSV multipart upload → dc_configs upsert.
     *
     * @param file multipart 파일 (UTF-8 CSV, BOM 허용)
     * @return inserted/updated/skipped/rejected 결과
     */
    @Operation(summary = "DC 거래처 할인 정보 CSV import",
            description = "Notion 에서 다운받은 거래처 DC 정보 CSV 를 native 보존. MASTER role 만 호출 가능.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "import 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "CSV 파싱/형식 오류"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "인증 누락"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "MASTER role 부재")
    })
    @PreAuthorize("@hr.isExecutiveOffice() and hasRole('MASTER')")
    @RequirePermission(page = "dc-config.import", action = "EDIT")
    @PostMapping(value = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<DcConfigImportResult> importCsv(@RequestParam("file") MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "CSV 파일이 비어있습니다");
        }
        try {
            DcConfigImportResult result = dcConfigImportService.importCsv(file.getInputStream());
            return ApiResponse.ok(result, "DC 거래처 할인 정보 import 완료");
        } catch (IOException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "CSV 파일을 읽을 수 없습니다: " + ex.getMessage());
        }
    }
}
