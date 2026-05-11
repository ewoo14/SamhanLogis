package com.samhanair.logis.accounting.web;

import com.samhanair.logis.accounting.service.TaxInvoiceBatchService;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceBatchExclusionRequest;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceBatchExclusionResponse;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceBatchHistoryResponse;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceBatchPreviewRequest;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceBatchPreviewResponse;
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
import org.springframework.security.access.prepost.PreAuthorize;
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
 * 세금계산서 일괄발행 배치 endpoint — GAS 계산서일괄등록양식 생성 4탭 BE 이식.
 *
 * <p>기존 TaxInvoiceController (PR #138/#139) 에 보완 형태로 추가.
 * 기본 path: {@code /api/v1/accounting/tax-invoices/batch}
 *
 * <p>권한 매트릭스:
 * <ul>
 *   <li>모든 endpoint — ACCOUNTANT / MANAGER / MASTER</li>
 * </ul>
 *
 * <p>사용자 노출 식별자: batchNo (TIB-yyyyMM-NNN) / partnerCode — UUID 직접 노출 금지.
 */
@Tag(name = "세금계산서 일괄발행", description = "홈택스 일괄 업로드용 .xlsx 변환 + 100건 분할 + 제외 거래처 관리 + 저장 이력")
@RestController
@RequestMapping("/accounting/tax-invoices/batch")
@RequiredArgsConstructor
public class TaxInvoiceBatchController {

    private static final String XLSX_CONTENT_TYPE =
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    private final TaxInvoiceBatchService batchService;

    // =========================================================================
    // A. 일괄발행 미리보기
    // =========================================================================

    /**
     * 판매조회 데이터 → 홈택스 양식 변환 미리보기.
     *
     * <p>slip-service 에서 [fromDate, toDate] 판매조회 전체 fetch 후 홈택스 59컬럼으로 변환.
     * 변환 결과를 DB 에 저장(COMPLETED) 후 rows + splitFileCount 반환.
     *
     * @param userId 작업자 UUID (X-User-Id 헤더)
     * @param req    미리보기 요청 (fromDate, toDate, excludeUnconfirmed, excludePartnerCodes)
     * @return 미리보기 응답 (batchNo, totalRowCount, splitFileCount, rows)
     */
    @Operation(summary = "일괄발행 미리보기",
            description = "판매조회 데이터를 홈택스 59컬럼 양식으로 변환. 결과는 DB 저장(batchNo 채번).")
    @PreAuthorize("hasAnyRole('ACCOUNTANT','MANAGER','MASTER')")
    @PostMapping("/preview")
    public ApiResponse<TaxInvoiceBatchPreviewResponse> preview(
            @RequestHeader("X-User-Id") String userId,
            @Valid @RequestBody TaxInvoiceBatchPreviewRequest req) {
        UUID actorId = parseUuid(userId);
        TaxInvoiceBatchPreviewResponse result = batchService.preview(
                req.fromDate(),
                req.toDate(),
                req.excludeUnconfirmed(),
                req.excludePartnerCodes(),
                actorId
        );
        return ApiResponse.ok(result);
    }

    // =========================================================================
    // B. .xlsx 다운로드 (100건 분할)
    // =========================================================================

    /**
     * 저장된 배치의 분할 파일 .xlsx 다운로드.
     *
     * <p>fileIndex=0 이면 첫 번째 100건 파일, fileIndex=1 이면 101~200건 파일.
     * 다운로드 완료 후 배치 상태가 DOWNLOADED 로 변경됨.
     *
     * @param batchId   배치 UUID (내부 식별자)
     * @param fileIndex 분할 파일 인덱스 (0-based, 기본값 0)
     * @return .xlsx binary stream
     */
    @Operation(summary = "일괄발행 .xlsx 다운로드",
            description = "100건 단위 분할 파일 다운로드. fileIndex=0 이면 첫 파일.")
    @PreAuthorize("hasAnyRole('ACCOUNTANT','MANAGER','MASTER')")
    @GetMapping("/{batchId}/excel")
    public ResponseEntity<byte[]> downloadExcel(
            @PathVariable UUID batchId,
            @RequestParam(defaultValue = "0") int fileIndex) {
        byte[] xlsx = batchService.generateExcel(batchId, fileIndex);
        String filename = "homtax_batch_" + fileIndex + ".xlsx";
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(XLSX_CONTENT_TYPE))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + filename + "\"")
                .body(xlsx);
    }

    // =========================================================================
    // C. 제외 거래처 CRUD
    // =========================================================================

    /**
     * 제외 거래처 목록 조회.
     *
     * @return 활성 제외 거래처 목록 (등록일 DESC)
     */
    @Operation(summary = "제외 거래처 목록 조회",
            description = "일괄발행 시 자동 제외할 거래처 코드 마스터 목록.")
    @PreAuthorize("hasAnyRole('ACCOUNTANT','MANAGER','MASTER')")
    @GetMapping("/exclusions")
    public ApiResponse<List<TaxInvoiceBatchExclusionResponse>> listExclusions() {
        return ApiResponse.ok(batchService.listExclusions());
    }

    /**
     * 제외 거래처 등록.
     *
     * @param userId 작업자 UUID (X-User-Id 헤더)
     * @param req    등록 요청 (partnerCode, partnerName, reason)
     * @return 등록된 제외 거래처 응답
     */
    @Operation(summary = "제외 거래처 등록",
            description = "지정 거래처 코드를 일괄발행 제외 마스터에 추가. 중복 등록 시 409.")
    @PreAuthorize("hasAnyRole('ACCOUNTANT','MANAGER','MASTER')")
    @PostMapping("/exclusions")
    public ApiResponse<TaxInvoiceBatchExclusionResponse> addExclusion(
            @RequestHeader("X-User-Id") String userId,
            @Valid @RequestBody TaxInvoiceBatchExclusionRequest req) {
        return ApiResponse.ok(batchService.addExclusion(
                req.partnerCode(), req.partnerName(), req.reason(), userId));
    }

    /**
     * 제외 거래처 삭제 (Soft Delete).
     *
     * @param partnerCode 거래처 코드
     * @param userId      작업자 UUID (X-User-Id 헤더)
     * @return 204 No Content
     */
    @Operation(summary = "제외 거래처 삭제",
            description = "Soft Delete — is_deleted=true 마킹. 미등록 거래처 코드 시 404.")
    @PreAuthorize("hasAnyRole('ACCOUNTANT','MANAGER','MASTER')")
    @DeleteMapping("/exclusions/{partnerCode}")
    public ResponseEntity<Void> removeExclusion(
            @PathVariable String partnerCode,
            @RequestHeader("X-User-Id") String userId) {
        batchService.removeExclusion(partnerCode, userId);
        return ResponseEntity.noContent().build();
    }

    // =========================================================================
    // D. 저장 이력
    // =========================================================================

    /**
     * 저장 이력 목록 조회 (페이지네이션).
     *
     * @param fromDate 조회 시작일 (기본: 오늘 기준 30일 전)
     * @param toDate   조회 종료일 (기본: 오늘)
     * @param pageable 페이지 정보 (기본 size=20, processedAt DESC)
     * @return 이력 목록 페이지
     */
    @Operation(summary = "저장 이력 목록",
            description = "일괄발행 저장 이력 목록. fromDate~toDate 범위 필터, processedAt DESC 정렬.")
    @PreAuthorize("hasAnyRole('ACCOUNTANT','MANAGER','MASTER')")
    @GetMapping("/history")
    public ApiResponse<Page<TaxInvoiceBatchHistoryResponse>> listHistory(
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fromDate,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate toDate,
            @PageableDefault(size = 20, sort = "processedAt", direction = Sort.Direction.DESC)
            Pageable pageable) {
        LocalDate from = fromDate != null ? fromDate : LocalDate.now().minusMonths(1);
        LocalDate to = toDate != null ? toDate : LocalDate.now();
        return ApiResponse.ok(batchService.listHistory(from, to, pageable));
    }

    /**
     * 저장 이력 단건 조회 — dataSnapshotJson (gzip+base64) 포함.
     *
     * @param batchId 배치 UUID (내부 식별자)
     * @return 이력 상세 응답 (스냅샷 포함)
     */
    @Operation(summary = "저장 이력 단건 조회",
            description = "batchId 기준 단건. dataSnapshotJson (gzip+base64) 포함 반환.")
    @PreAuthorize("hasAnyRole('ACCOUNTANT','MANAGER','MASTER')")
    @GetMapping("/history/{batchId}")
    public ApiResponse<TaxInvoiceBatchHistoryResponse> getHistoryDetail(
            @PathVariable UUID batchId) {
        return ApiResponse.ok(batchService.getHistoryDetail(batchId));
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
