package com.samhanair.logis.accounting.web;

import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.accounting.domain.DailyClosingKind;
import com.samhanair.logis.accounting.domain.DailyClosingSourceKind;
import com.samhanair.logis.accounting.service.HometaxExportService;
import com.samhanair.logis.accounting.service.LedgerImageService;
import com.samhanair.logis.accounting.service.LedgerSnapshotService;
import com.samhanair.logis.accounting.service.MonthEndCloseService;
import com.samhanair.logis.accounting.service.PartnerLedgerReadService;
import com.samhanair.logis.accounting.service.SalesAggregateService;
import com.samhanair.logis.accounting.service.StatementBatchService;
import com.samhanair.logis.accounting.web.dto.DailyClosingDetailResponse;
import com.samhanair.logis.accounting.web.dto.LedgerImageResponse;
import com.samhanair.logis.accounting.web.dto.LedgerHistoryResponse;
import com.samhanair.logis.accounting.web.dto.PartnerLedgerResponse;
import com.samhanair.logis.accounting.web.dto.SalesAggregateRow;
import com.samhanair.logis.accounting.web.dto.StatementBatchRow;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceBatchExclusionRequest;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceBatchExclusionResponse;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceBatchHistoryResponse;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceBatchPreviewRequest;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceBatchPreviewResponse;
import com.samhanair.logis.common.dto.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
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
 * 회계 리포트 통합 endpoint (PR-E2 BE-A8/A9/A10/A11/A12 + PR #161 흡수).
 *
 * <p>legacy GAS B 카테고리 4건 (원장/거래명세서/계산서/일마감) + 매출집계 1건 — Samhan Public 자체
 * 분개/세금계산서 자동 조회로 이식. 이카운트 의존 0.
 *
 * <p>endpoint 매트릭스 (모두 ACCOUNTANT/MANAGER/MASTER 가드):
 * <ul>
 *   <li>GET  /accounting/sales/aggregate                        — BE-A8 매출/수금/채권 집계</li>
 *   <li>GET  /accounting/journals/ledger-data                   — BE-A9 거래처별 원장</li>
 *   <li>GET  /accounting/statements/batch-data                  — BE-A10 거래명세서 batch</li>
 *   <li>GET  /accounting/tax-invoice/hometax-export             — BE-A11 홈택스 일괄 legacy (xlsx)</li>
 *   <li>GET  /accounting/closings/daily                         — BE-A12 일별 마감 detail</li>
 *   <li>POST /accounting/hometax-export/preview                 — 59컬럼 미리보기 (PR #161 흡수)</li>
 *   <li>GET  /accounting/hometax-export/{batchId}/split         — 분할 xlsx 다운로드</li>
 *   <li>GET  /accounting/hometax-export/exclusions              — 제외 거래처 목록</li>
 *   <li>POST /accounting/hometax-export/exclusions              — 제외 거래처 등록</li>
 *   <li>DELETE /accounting/hometax-export/exclusions/{code}     — 제외 거래처 삭제</li>
 *   <li>GET  /accounting/hometax-export/history                 — 저장 이력 목록</li>
 *   <li>GET  /accounting/hometax-export/history/{batchId}       — 저장 이력 단건</li>
 * </ul>
 *
 * <p>UUID 비공개 가드 — 응답은 partnerCode + partnerName + slipNo / taxInvoiceNo / journalNo
 * 만 노출. 모든 응답 ApiResponse 래핑 (xlsx binary 제외).
 */
@Slf4j
@Tag(name = "회계 리포트", description = "매출집계/원장/거래명세서/홈택스export/일마감 + 일괄발행 배치(PR#161)")
@RestController
@RequestMapping
@RequiredArgsConstructor
public class AccountingReportController {

    /** SP-D2 — 재무 보고서 페이지 코드 (매출집계/원장/일마감 detail). */
    private static final String REPORTS_PAGE_CODE = "accounting.reports";
    /** SP-D2 — 거래명세서 일괄 + 홈택스 export 페이지 코드. */
    private static final String STATEMENT_BATCH_PAGE_CODE = "accounting.statement-batch";
    private static final String ROLE_HEADER = "X-User-Role";

    private static final String XLSX_CONTENT_TYPE =
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    private final SalesAggregateService salesAggregateService;
    private final LedgerImageService ledgerImageService;
    private final PartnerLedgerReadService partnerLedgerReadService;
    private final LedgerSnapshotService ledgerSnapshotService;
    private final StatementBatchService statementBatchService;
    private final HometaxExportService hometaxExportService;
    private final MonthEndCloseService monthEndCloseService;
    private final DynamicPermissionClient dynamicPermissionClient;

    // =========================================================================
    // BE-A8 ~ A12 (legacy — PR-E2)
    // =========================================================================

    /** BE-A8 매출/수금/채권 집계. */
    @Operation(summary = "매출/수금/채권 집계 (BE-A8)",
            description = "기간 + 거래처 단일/전체 필터 — 자체 분개 401/110 코드 기반 합계")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "from/to 누락 또는 역순")
    })
    @GetMapping("/accounting/sales/aggregate")
    @RequirePermission(page = REPORTS_PAGE_CODE, action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<List<SalesAggregateRow>> aggregate(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String partnerCode,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        checkReportViewPermission(roleHeader);
        return ApiResponse.ok(salesAggregateService.aggregate(from, to, partnerCode));
    }

    /** BE-A9 거래처별 원장 데이터. */
    @Operation(summary = "거래처별 원장 (BE-A9)",
            description = "partner snapshot + 단톡방 매핑 + 분개 line 시간순 + 누적 잔액")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "partnerCode 미존재")
    })
    @GetMapping("/accounting/journals/ledger-data")
    @RequirePermission(page = "accounting.partner-ledger", action = com.samhanair.logis.security.permission.PermissionAction.PRINT)
    public ApiResponse<LedgerImageResponse> ledger(
            @RequestParam String partnerCode,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestHeader(value = "X-User-Id", required = false) String userId) {
        return ApiResponse.ok(ledgerImageService.getLedger(partnerCode, from, to, parseUuid(userId)));
    }

    /** 사용자가 명시적으로 원장 snapshot 저장을 요청하는 write 계약. */
    @PostMapping("/accounting/journals/ledger-snapshots")
    @RequirePermission(page = "accounting.partner-ledger", action = com.samhanair.logis.security.permission.PermissionAction.PRINT)
    public ApiResponse<LedgerImageResponse> captureLedger(
            @RequestParam String partnerCode,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestHeader(value = "X-User-Id", required = false) String userId) {
        return ApiResponse.ok(ledgerSnapshotService.capture(
                partnerCode, from, to, parseUuid(userId)));
    }

    /** 출고 판매전표 품목과 확정 입금보고서를 함께 반환하는 거래처별 원장 read 계약. */
    @GetMapping("/accounting/journals/partner-ledger")
    @RequirePermission(page = "accounting.partner-ledger", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<PartnerLedgerResponse> partnerLedger(
            @RequestParam(required = false) String partnerCode,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ApiResponse.ok(partnerLedgerReadService.read(partnerCode, from, to));
    }

    /** 거래처별 원장 자동 저장 이력 — 날짜 범위와 거래처 코드로 조회한다. */
    @GetMapping("/accounting/journals/ledger-history")
    @RequirePermission(page = "accounting.partner-ledger", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<Page<LedgerHistoryResponse>> ledgerHistory(
            @RequestParam String partnerCode,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @PageableDefault(size = 20, sort = "processedAt", direction = Sort.Direction.DESC)
            Pageable pageable) {
        return ApiResponse.ok(ledgerSnapshotService.history(partnerCode, from, to, pageable));
    }

    /** 거래처별 원장 이력 복원 — 원본 분개를 변경하지 않고 저장 시점 화면 데이터를 반환한다. */
    @GetMapping("/accounting/journals/ledger-history/{batchNo}/restore")
    @RequirePermission(page = "accounting.partner-ledger", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<LedgerHistoryResponse> restoreLedger(@PathVariable String batchNo) {
        return ApiResponse.ok(ledgerSnapshotService.restore(batchNo));
    }

    /** BE-A10 거래명세서 batch. */
    @Operation(summary = "거래명세서 batch (BE-A10)",
            description = "기간 ISSUED 세금계산서 → 거래처별 그룹핑 + 라인 snapshot + 단톡방")
    @GetMapping("/accounting/statements/batch-data")
    @RequirePermission(page = STATEMENT_BATCH_PAGE_CODE, action = com.samhanair.logis.security.permission.PermissionAction.PRINT)
    public ApiResponse<List<StatementBatchRow>> statementBatch(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        checkStatementBatchViewPermission(roleHeader);
        return ApiResponse.ok(statementBatchService.batch(from, to));
    }

    /**
     * BE-A11 홈택스 일괄 업로드 양식 legacy export (binary xlsx, 12컬럼).
     *
     * <p>PR-E2 하위 호환 endpoint — {@link HometaxExportService#HEADER_COLUMNS_LEGACY_12} 12컬럼 사용.
     * 풍성한 59컬럼 일괄발행은 {@code POST /accounting/hometax-export/preview} 사용.
     */
    @Operation(summary = "홈택스 일괄 양식 legacy (BE-A11)",
            description = "기간 ISSUED 세금계산서 → 홈택스 12컬럼 xlsx (100건 분할 sheet). 59컬럼은 /hometax-export/preview 사용.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "xlsx binary"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "500", description = "workbook 직렬화 실패")
    })
    @GetMapping("/accounting/tax-invoice/hometax-export")
    @RequirePermission(page = "accounting.hometax-export", action = com.samhanair.logis.security.permission.PermissionAction.DOWNLOAD)
    public ResponseEntity<byte[]> hometaxExport(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        byte[] xlsx = hometaxExportService.export(from, to);
        String filename = "hometax-export_" + from.format(DateTimeFormatter.BASIC_ISO_DATE)
                + "_" + to.format(DateTimeFormatter.BASIC_ISO_DATE) + ".xlsx";
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(XLSX_CONTENT_TYPE))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + filename + "\"")
                .body(xlsx);
    }

    /** BE-A12 일별 세금계산서 마감 detail. */
    @Operation(summary = "일별 마감 detail (BE-A12)",
            description = "일별 매출/세금계산서/할인 detail — read-only (마감 OPEN/CLOSED 무관)")
    @GetMapping("/accounting/closings/daily")
    @RequirePermission(page = REPORTS_PAGE_CODE, action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<DailyClosingDetailResponse> dailyDetail(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(required = false) DailyClosingKind kind,
            @RequestParam(required = false) DailyClosingSourceKind sourceKind) {
        return ApiResponse.ok(monthEndCloseService.getDailyDetail(date, kind, sourceKind));
    }

    // =========================================================================
    // 홈택스 일괄발행 통합 endpoint (PR #161 흡수)
    // path prefix: /accounting/hometax-export
    // =========================================================================

    /**
     * 판매조회 데이터 → 홈택스 59컬럼 양식 변환 미리보기.
     *
     * <p>slip-service 에서 [fromDate, toDate] 판매조회 전체 fetch 후 홈택스 59컬럼으로 변환.
     * 변환 결과를 DB 에 저장(COMPLETED) 후 rows + splitFileCount 반환.
     * 다운로드는 {@code GET /accounting/hometax-export/{batchId}/split?fileIndex=0} 사용.
     *
     * <p>PR #161 {@code POST /accounting/tax-invoices/batch/preview} 기능 흡수.
     * 기존 path 는 deprecated — {@link TaxInvoiceBatchController} 참조.
     *
     * @param userId 작업자 UUID (X-User-Id 헤더)
     * @param req    미리보기 요청 (fromDate, toDate, excludeUnconfirmed, excludePartnerCodes)
     * @return 미리보기 응답 (batchNo, totalRowCount, splitFileCount, rows)
     */
    @Operation(summary = "홈택스 일괄발행 미리보기 (59컬럼)",
            description = "판매조회 데이터를 홈택스 59컬럼 양식으로 변환. 결과는 DB 저장(batchNo 채번). " +
                    "PR #161 /batch/preview 흡수 — 신규 위치.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "변환 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "요청 파라미터 오류"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "500", description = "slip-service 조회 실패 또는 직렬화 실패")
    })
    @PostMapping("/accounting/hometax-export/preview")
    @RequirePermission(page = "accounting.hometax-export", action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    public ApiResponse<TaxInvoiceBatchPreviewResponse> hometaxPreview(
            @RequestHeader("X-User-Id") String userId,
            @Valid @RequestBody TaxInvoiceBatchPreviewRequest req) {
        UUID actorId = parseUuid(userId);
        return ApiResponse.ok(hometaxExportService.previewBatch(req, actorId));
    }

    /**
     * 저장된 배치의 분할 파일 홈택스 59컬럼 xlsx 다운로드.
     *
     * <p>fileIndex=0 이면 첫 번째 100건 파일, fileIndex=1 이면 101~200건 파일.
     * 다운로드 완료 후 배치 상태가 DOWNLOADED 로 변경됨.
     *
     * <p>PR #161 {@code GET /accounting/tax-invoices/batch/{batchId}/excel?fileIndex} 흡수.
     *
     * @param batchId   배치 UUID (내부 식별자 — 사용자에게 직접 노출 금지)
     * @param fileIndex 분할 파일 인덱스 (0-based, 기본값 0)
     * @return 홈택스 59컬럼 xlsx binary stream
     */
    @Operation(summary = "홈택스 분할 xlsx 다운로드",
            description = "100건 단위 분할 파일 다운로드. fileIndex=0 이면 첫 파일. PR #161 /batch/{id}/excel 흡수.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "xlsx binary"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "배치 미존재"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "fileIndex 범위 초과")
    })
    @GetMapping("/accounting/hometax-export/{batchId}/split")
    @RequirePermission(page = "accounting.hometax-export", action = com.samhanair.logis.security.permission.PermissionAction.DOWNLOAD)
    public ResponseEntity<byte[]> hometaxSplitDownload(
            @PathVariable UUID batchId,
            @RequestParam(defaultValue = "0") int fileIndex) {
        byte[] xlsx = hometaxExportService.exportSplitFile(batchId, fileIndex);
        String filename = "homtax_batch_" + fileIndex + ".xlsx";
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(XLSX_CONTENT_TYPE))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + filename + "\"")
                .body(xlsx);
    }

    /**
     * 제외 거래처 목록 조회.
     *
     * <p>일괄발행 시 자동 제외할 거래처 코드 마스터 목록.
     * PR #161 {@code GET /accounting/tax-invoices/batch/exclusions} 흡수.
     *
     * @return 활성 제외 거래처 목록 (등록일 DESC)
     */
    @Operation(summary = "제외 거래처 목록 조회",
            description = "일괄발행 시 자동 제외할 거래처 코드 마스터 목록. PR #161 /batch/exclusions 흡수.")
    @GetMapping("/accounting/hometax-export/exclusions")
    @RequirePermission(page = "accounting.hometax-export", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<List<TaxInvoiceBatchExclusionResponse>> listExclusions() {
        return ApiResponse.ok(hometaxExportService.listExclusions());
    }

    /**
     * 제외 거래처 등록.
     *
     * <p>지정 거래처 코드를 일괄발행 제외 마스터에 추가. 중복 등록 시 409.
     * PR #161 {@code POST /accounting/tax-invoices/batch/exclusions} 흡수.
     *
     * @param userId 작업자 UUID (X-User-Id 헤더)
     * @param req    등록 요청 (partnerCode, partnerName, reason)
     * @return 등록된 제외 거래처 응답
     */
    @Operation(summary = "제외 거래처 등록",
            description = "지정 거래처 코드를 일괄발행 제외 마스터에 추가. 중복 등록 시 409. PR #161 /batch/exclusions 흡수.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "등록 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "이미 등록된 거래처 코드")
    })
    @PostMapping("/accounting/hometax-export/exclusions")
    @RequirePermission(page = "accounting.hometax-export", action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    public ApiResponse<TaxInvoiceBatchExclusionResponse> addExclusion(
            @RequestHeader("X-User-Id") String userId,
            @Valid @RequestBody TaxInvoiceBatchExclusionRequest req) {
        return ApiResponse.ok(hometaxExportService.addExclusion(
                req.partnerCode(), req.partnerName(), req.reason(), userId));
    }

    /**
     * 제외 거래처 삭제 (Soft Delete).
     *
     * <p>Soft Delete — is_deleted=true 마킹. 미등록 거래처 코드 시 404.
     * PR #161 {@code DELETE /accounting/tax-invoices/batch/exclusions/{partnerCode}} 흡수.
     *
     * @param partnerCode 거래처 코드 (비즈니스 식별자 — UUID 아님)
     * @param userId      작업자 UUID (X-User-Id 헤더)
     * @return 204 No Content
     */
    @Operation(summary = "제외 거래처 삭제",
            description = "Soft Delete — is_deleted=true 마킹. 미등록 거래처 코드 시 404.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "204", description = "삭제 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "미등록 거래처 코드")
    })
    @DeleteMapping("/accounting/hometax-export/exclusions/{partnerCode}")
    @RequirePermission(page = "accounting.hometax-export", action = com.samhanair.logis.security.permission.PermissionAction.DELETE)
    public ResponseEntity<Void> removeExclusion(
            @PathVariable String partnerCode,
            @RequestHeader("X-User-Id") String userId) {
        hometaxExportService.removeExclusion(partnerCode, userId);
        return ResponseEntity.noContent().build();
    }

    /**
     * 저장 이력 목록 조회 (페이지네이션).
     *
     * <p>일괄발행 저장 이력 목록. fromDate~toDate 범위 필터, processedAt DESC 정렬.
     * PR #161 {@code GET /accounting/tax-invoices/batch/history} 흡수.
     *
     * @param fromDate 조회 시작일 (기본: 오늘 기준 1개월 전)
     * @param toDate   조회 종료일 (기본: 오늘)
     * @param pageable 페이지 정보 (기본 size=20, processedAt DESC)
     * @return 이력 목록 페이지
     */
    @Operation(summary = "홈택스 일괄발행 저장 이력 목록",
            description = "일괄발행 저장 이력 목록. fromDate~toDate 범위 필터. PR #161 /batch/history 흡수.")
    @GetMapping("/accounting/hometax-export/history")
    @RequirePermission(page = "accounting.hometax-export", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<Page<TaxInvoiceBatchHistoryResponse>> listHistory(
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fromDate,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate toDate,
            @PageableDefault(size = 20, sort = "processedAt", direction = Sort.Direction.DESC)
            Pageable pageable) {
        LocalDate from = fromDate != null ? fromDate : LocalDate.now().minusMonths(1);
        LocalDate to = toDate != null ? toDate : LocalDate.now();
        return ApiResponse.ok(hometaxExportService.listHistory(from, to, pageable));
    }

    /**
     * 저장 이력 단건 조회 — dataSnapshotJson (gzip+base64) 포함.
     *
     * <p>PR #161 {@code GET /accounting/tax-invoices/batch/history/{batchId}} 흡수.
     *
     * @param batchId 배치 UUID (내부 식별자)
     * @return 이력 상세 응답 (스냅샷 포함)
     */
    @Operation(summary = "홈택스 일괄발행 저장 이력 단건 조회",
            description = "batchId 기준 단건. dataSnapshotJson (gzip+base64) 포함 반환. PR #161 /batch/history/{id} 흡수.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "배치 미존재")
    })
    @GetMapping("/accounting/hometax-export/history/{batchId}")
    @RequirePermission(page = "accounting.hometax-export", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<TaxInvoiceBatchHistoryResponse> getHistoryDetail(
            @PathVariable UUID batchId) {
        return ApiResponse.ok(hometaxExportService.getHistoryDetail(batchId));
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

    // =========================================================================
    // SP-D2 동적 권한 헬퍼
    // =========================================================================

    /**
     * SP-D2 동적 VIEW 권한 검증 — 재무 보고서 페이지.
     * canView=false → 점진 마이그레이션 정책으로 통과.
     */
    private void checkReportViewPermission(String actorRole) {
        if (actorRole == null || actorRole.isBlank()) {
            return;
        }
        boolean canView = dynamicPermissionClient.canView(actorRole, REPORTS_PAGE_CODE);
        if (!canView) {
            log.debug("[SP-D2] VIEW 동적 권한 false (fallback 또는 deny) — roleCode={} pageCode={}",
                    actorRole, REPORTS_PAGE_CODE);
        }
    }

    /**
     * SP-D2 동적 VIEW 권한 검증 — 거래명세서 일괄 페이지.
     * canView=false → 점진 마이그레이션 정책으로 통과.
     */
    private void checkStatementBatchViewPermission(String actorRole) {
        if (actorRole == null || actorRole.isBlank()) {
            return;
        }
        boolean canView = dynamicPermissionClient.canView(actorRole, STATEMENT_BATCH_PAGE_CODE);
        if (!canView) {
            log.debug("[SP-D2] VIEW 동적 권한 false (fallback 또는 deny) — roleCode={} pageCode={}",
                    actorRole, STATEMENT_BATCH_PAGE_CODE);
        }
    }
}
