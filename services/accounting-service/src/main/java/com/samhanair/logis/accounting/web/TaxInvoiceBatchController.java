package com.samhanair.logis.accounting.web;

import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.accounting.service.HometaxExportService;
import com.samhanair.logis.accounting.service.TaxInvoiceBatchFromSalesSlipsService;
import com.samhanair.logis.accounting.web.dto.CreateTaxInvoiceFromSalesSlipsRequest;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceBatchCandidateResponse;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceBatchExclusionRequest;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceBatchExclusionResponse;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceBatchHistoryResponse;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceBatchPreviewRequest;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceBatchPreviewResponse;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceFromSalesSlipsResponse;
import com.samhanair.logis.common.dto.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 세금계산서 배치 endpoint.
 *
 * <p>홈택스 일괄발행 legacy endpoint 는 deprecated 상태입니다.
 * Phase 12 통합 작업에서 해당 기능이 {@link AccountingReportController} 로 흡수되었습니다.
 *
 * <p>신규 위치:
 * <ul>
 *   <li>{@code POST /accounting/hometax-export/preview}                  — 미리보기</li>
 *   <li>{@code GET  /accounting/hometax-export/{batchId}/split}          — 분할 xlsx 다운로드</li>
 *   <li>{@code GET  /accounting/hometax-export/exclusions}               — 제외 거래처 목록</li>
 *   <li>{@code POST /accounting/hometax-export/exclusions}               — 제외 거래처 등록</li>
 *   <li>{@code DELETE /accounting/hometax-export/exclusions/{code}}      — 제외 거래처 삭제</li>
 *   <li>{@code GET  /accounting/hometax-export/history}                  — 저장 이력 목록</li>
 *   <li>{@code GET  /accounting/hometax-export/history/{batchId}}        — 저장 이력 단건</li>
 * </ul>
 *
 * <p>SP-SAS-3 이후 신규 출고전표 N:1 세금계산서 묶음 발행 endpoint 를 함께 제공합니다.
 */
@Tag(name = "세금계산서 배치",
        description = "출고전표 묶음 발행 및 deprecated 홈택스 일괄발행 호환 endpoint")
@RestController
@RequestMapping
@RequiredArgsConstructor
public class TaxInvoiceBatchController {

    private static final String XLSX_CONTENT_TYPE =
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    /** Deprecation 응답 헤더 값 (Sunset RFC 8594 준용). */
    private static final String DEPRECATION_HEADER_VALUE = "true";

    private final HometaxExportService hometaxExportService;
    private final TaxInvoiceBatchFromSalesSlipsService batchFromSalesSlipsService;

    /**
     * 출고전표 N장 → 세금계산서 1장 묶음 발행.
     *
     * <p>동일 거래처 / 동일월 / POSTED / 미연결 출고전표만 허용합니다.
     */
    @Operation(summary = "출고전표 묶음 세금계산서 발행",
            description = "POSTED 출고전표 N장을 동일 거래처·동일월 기준으로 세금계산서 1장에 연결하고 ISSUED 상태로 발행합니다.")
    @RequirePermission(page = "accounting.tax-invoice.batch-issue", action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    @PostMapping("/admin/tax-invoices/batch-from-sales-slips")
    public ResponseEntity<TaxInvoiceFromSalesSlipsResponse> createFromSalesSlips(
            @Valid @RequestBody CreateTaxInvoiceFromSalesSlipsRequest req,
            @RequestHeader("X-User-Id") String userId) {
        return ResponseEntity.ok(batchFromSalesSlipsService.createFromSalesSlips(req, userId));
    }

    @Operation(summary = "출고전표 묶음 발행 후보 조회",
            description = "POSTED + taxInvoice 미연결 출고전표를 거래처·월 기준으로 그룹화합니다.")
    @RequirePermission(page = "accounting.tax-invoice.batch-issue", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    @GetMapping("/admin/tax-invoices/batch-from-sales-slips/candidates")
    public ResponseEntity<List<TaxInvoiceBatchCandidateResponse>> listSalesSlipCandidates(
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String partnerCode) {
        return ResponseEntity.ok(batchFromSalesSlipsService.listCandidates(from, to, partnerCode));
    }

    // =========================================================================
    // A. 일괄발행 미리보기 (deprecated)
    // =========================================================================

    /**
     * 판매조회 데이터 → 홈택스 양식 변환 미리보기.
     *
     * <p><b>Deprecated</b> — Phase 12 통합. 본 endpoint 는 deprecated 처리됨.
     * 신규 위치: {@code POST /accounting/hometax-export/preview}.
     * 운영 전환 후 제거 예정.
     *
     * @param userId 작업자 UUID (X-User-Id 헤더)
     * @param req    미리보기 요청
     * @return 미리보기 응답 (Deprecation: true 헤더 포함)
     * @deprecated 신규 위치: {@code POST /accounting/hometax-export/preview}
     */
    @Deprecated
    @Operation(summary = "[Deprecated] 일괄발행 미리보기",
            description = "Phase 12 통합으로 deprecated. 신규 위치: POST /accounting/hometax-export/preview")
    @RequirePermission(page = "accounting.hometax-export", action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    @PostMapping("/accounting/tax-invoices/batch/preview")
    public ResponseEntity<ApiResponse<TaxInvoiceBatchPreviewResponse>> preview(
            @RequestHeader("X-User-Id") String userId,
            @Valid @RequestBody TaxInvoiceBatchPreviewRequest req) {
        UUID actorId = parseUuid(userId);
        TaxInvoiceBatchPreviewResponse result = hometaxExportService.previewBatch(req, actorId);
        return ResponseEntity.ok()
                .header("Deprecation", DEPRECATION_HEADER_VALUE)
                .header("Link", "</accounting/hometax-export/preview>; rel=\"successor-version\"")
                .body(ApiResponse.ok(result));
    }

    // =========================================================================
    // B. xlsx 다운로드 (deprecated)
    // =========================================================================

    /**
     * 저장된 배치의 분할 파일 xlsx 다운로드.
     *
     * <p><b>Deprecated</b> — Phase 12 통합. 신규 위치: {@code GET /accounting/hometax-export/{batchId}/split}.
     * 운영 전환 후 제거 예정.
     *
     * @param batchId   배치 UUID
     * @param fileIndex 분할 파일 인덱스 (0-based)
     * @return xlsx binary (Deprecation: true 헤더 포함)
     * @deprecated 신규 위치: {@code GET /accounting/hometax-export/{batchId}/split}
     */
    @Deprecated
    @Operation(summary = "[Deprecated] 일괄발행 xlsx 다운로드",
            description = "Phase 12 통합으로 deprecated. 신규 위치: GET /accounting/hometax-export/{batchId}/split")
    @RequirePermission(page = "accounting.hometax-export", action = com.samhanair.logis.security.permission.PermissionAction.DOWNLOAD)
    @GetMapping("/accounting/tax-invoices/batch/{batchId}/excel")
    public ResponseEntity<byte[]> downloadExcel(
            @PathVariable UUID batchId,
            @RequestParam(defaultValue = "0") int fileIndex) {
        byte[] xlsx = hometaxExportService.exportSplitFile(batchId, fileIndex);
        String filename = "homtax_batch_" + fileIndex + ".xlsx";
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(XLSX_CONTENT_TYPE))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + filename + "\"")
                .header("Deprecation", DEPRECATION_HEADER_VALUE)
                .header("Link",
                        "</accounting/hometax-export/" + batchId + "/split>; rel=\"successor-version\"")
                .body(xlsx);
    }

    // =========================================================================
    // C. 제외 거래처 CRUD (deprecated)
    // =========================================================================

    /**
     * 제외 거래처 목록 조회.
     *
     * <p><b>Deprecated</b> — Phase 12 통합. 신규 위치: {@code GET /accounting/hometax-export/exclusions}.
     * 운영 전환 후 제거 예정.
     *
     * @return 활성 제외 거래처 목록 (Deprecation: true 헤더 포함)
     * @deprecated 신규 위치: {@code GET /accounting/hometax-export/exclusions}
     */
    @Deprecated
    @Operation(summary = "[Deprecated] 제외 거래처 목록 조회",
            description = "Phase 12 통합으로 deprecated. 신규 위치: GET /accounting/hometax-export/exclusions")
    @RequirePermission(page = "accounting.hometax-export", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    @GetMapping("/accounting/tax-invoices/batch/exclusions")
    public ResponseEntity<ApiResponse<List<TaxInvoiceBatchExclusionResponse>>> listExclusions() {
        return ResponseEntity.ok()
                .header("Deprecation", DEPRECATION_HEADER_VALUE)
                .header("Link", "</accounting/hometax-export/exclusions>; rel=\"successor-version\"")
                .body(ApiResponse.ok(hometaxExportService.listExclusions()));
    }

    /**
     * 제외 거래처 등록.
     *
     * <p><b>Deprecated</b> — Phase 12 통합. 신규 위치: {@code POST /accounting/hometax-export/exclusions}.
     * 운영 전환 후 제거 예정.
     *
     * @param userId 작업자 UUID (X-User-Id 헤더)
     * @param req    등록 요청
     * @return 등록된 제외 거래처 응답 (Deprecation: true 헤더 포함)
     * @deprecated 신규 위치: {@code POST /accounting/hometax-export/exclusions}
     */
    @Deprecated
    @Operation(summary = "[Deprecated] 제외 거래처 등록",
            description = "Phase 12 통합으로 deprecated. 신규 위치: POST /accounting/hometax-export/exclusions")
    @RequirePermission(page = "accounting.hometax-export", action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    @PostMapping("/accounting/tax-invoices/batch/exclusions")
    public ResponseEntity<ApiResponse<TaxInvoiceBatchExclusionResponse>> addExclusion(
            @RequestHeader("X-User-Id") String userId,
            @Valid @RequestBody TaxInvoiceBatchExclusionRequest req) {
        TaxInvoiceBatchExclusionResponse result = hometaxExportService.addExclusion(
                req.partnerCode(), req.partnerName(), req.reason(), userId);
        return ResponseEntity.ok()
                .header("Deprecation", DEPRECATION_HEADER_VALUE)
                .header("Link", "</accounting/hometax-export/exclusions>; rel=\"successor-version\"")
                .body(ApiResponse.ok(result));
    }

    /**
     * 제외 거래처 삭제 (Soft Delete).
     *
     * <p><b>Deprecated</b> — Phase 12 통합.
     * 신규 위치: {@code DELETE /accounting/hometax-export/exclusions/{partnerCode}}.
     * 운영 전환 후 제거 예정.
     *
     * @param partnerCode 거래처 코드
     * @param userId      작업자 UUID (X-User-Id 헤더)
     * @return 204 No Content (Deprecation: true 헤더 포함)
     * @deprecated 신규 위치: {@code DELETE /accounting/hometax-export/exclusions/{partnerCode}}
     */
    @Deprecated
    @Operation(summary = "[Deprecated] 제외 거래처 삭제",
            description = "Phase 12 통합으로 deprecated. 신규 위치: DELETE /accounting/hometax-export/exclusions/{partnerCode}")
    @RequirePermission(page = "accounting.hometax-export", action = com.samhanair.logis.security.permission.PermissionAction.DELETE)
    @DeleteMapping("/accounting/tax-invoices/batch/exclusions/{partnerCode}")
    public ResponseEntity<Void> removeExclusion(
            @PathVariable String partnerCode,
            @RequestHeader("X-User-Id") String userId) {
        hometaxExportService.removeExclusion(partnerCode, userId);
        return ResponseEntity.noContent()
                .header("Deprecation", DEPRECATION_HEADER_VALUE)
                .header("Link",
                        "</accounting/hometax-export/exclusions/" + partnerCode + ">; rel=\"successor-version\"")
                .build();
    }

    // =========================================================================
    // D. 저장 이력 (deprecated)
    // =========================================================================

    /**
     * 저장 이력 목록 조회 (페이지네이션).
     *
     * <p><b>Deprecated</b> — Phase 12 통합. 신규 위치: {@code GET /accounting/hometax-export/history}.
     * 운영 전환 후 제거 예정.
     *
     * @param fromDate 조회 시작일
     * @param toDate   조회 종료일
     * @param pageable 페이지 정보
     * @return 이력 목록 페이지 (Deprecation: true 헤더 포함)
     * @deprecated 신규 위치: {@code GET /accounting/hometax-export/history}
     */
    @Deprecated
    @Operation(summary = "[Deprecated] 저장 이력 목록",
            description = "Phase 12 통합으로 deprecated. 신규 위치: GET /accounting/hometax-export/history")
    @RequirePermission(page = "accounting.hometax-export", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    @GetMapping("/accounting/tax-invoices/batch/history")
    public ResponseEntity<ApiResponse<Page<TaxInvoiceBatchHistoryResponse>>> listHistory(
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fromDate,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate toDate,
            @PageableDefault(size = 20, sort = "processedAt", direction = Sort.Direction.DESC)
            Pageable pageable) {
        LocalDate from = fromDate != null ? fromDate : LocalDate.now().minusMonths(1);
        LocalDate to = toDate != null ? toDate : LocalDate.now();
        return ResponseEntity.ok()
                .header("Deprecation", DEPRECATION_HEADER_VALUE)
                .header("Link", "</accounting/hometax-export/history>; rel=\"successor-version\"")
                .body(ApiResponse.ok(hometaxExportService.listHistory(from, to, pageable)));
    }

    /**
     * 저장 이력 단건 조회 — dataSnapshotJson (gzip+base64) 포함.
     *
     * <p><b>Deprecated</b> — Phase 12 통합.
     * 신규 위치: {@code GET /accounting/hometax-export/history/{batchId}}.
     * 운영 전환 후 제거 예정.
     *
     * @param batchId 배치 UUID
     * @return 이력 상세 응답 (Deprecation: true 헤더 포함)
     * @deprecated 신규 위치: {@code GET /accounting/hometax-export/history/{batchId}}
     */
    @Deprecated
    @Operation(summary = "[Deprecated] 저장 이력 단건 조회",
            description = "Phase 12 통합으로 deprecated. 신규 위치: GET /accounting/hometax-export/history/{batchId}")
    @RequirePermission(page = "accounting.hometax-export", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    @GetMapping("/accounting/tax-invoices/batch/history/{batchId}")
    public ResponseEntity<ApiResponse<TaxInvoiceBatchHistoryResponse>> getHistoryDetail(
            @PathVariable UUID batchId) {
        return ResponseEntity.ok()
                .header("Deprecation", DEPRECATION_HEADER_VALUE)
                .header("Link",
                        "</accounting/hometax-export/history/" + batchId + ">; rel=\"successor-version\"")
                .body(ApiResponse.ok(hometaxExportService.getHistoryDetail(batchId)));
    }

    // =========================================================================
    // 내부 유틸
    // =========================================================================

    private static UUID parseUuid(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return UUID.fromString(raw);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
