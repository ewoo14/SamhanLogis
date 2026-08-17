package com.samhanair.logis.product.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.product.client.GoogleSheetsClient;
import com.samhanair.logis.product.service.ProductLookupSheetSyncService;
import com.samhanair.logis.product.service.ProductSheetSyncService;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 제품 admin endpoint — 옵션 C-3 결합 (시트 → DB 수동 sync trigger).
 *
 * <p><b>출처</b>: 개발책임자 결정 2026-05-05 — 옵션 C-2 (cron 5분, PR-D Part 1) +
 * C-3 (admin trigger) 결합. 시트 변경 즉시 반영이 필요한 경우 본 endpoint 호출 →
 * 캐시 invalidate + sync 실행.
 *
 * <p><b>PR-D Part 1 보강</b>: 마지막 sync 시각 + SyncSummary 조회 endpoint
 * ({@link #lastSync()}) 추가. admin UI 가 trigger 결과 + 직전 sync 메타 데이터를
 * 한 화면에서 확인할 수 있도록 분리. 메모리 보관 (bean field, 영속 X — V6 별도 PR).
 *
 * <p><b>권한</b>: C5 후속 정리부터 {@code products.sync} page-code 로 보호한다.
 * POST {@code /sync} 는 시트→DB 반영을 실행하므로 CREATE, GET {@code /sync/last} 는
 * 마지막 실행 메타 조회이므로 VIEW 를 요구한다.
 */
@RestController
@RequestMapping("/api/v1/products/admin")
@RequiredArgsConstructor
public class ProductAdminController {

    private final ProductSheetSyncService syncService;
    private final ProductLookupSheetSyncService lookupSyncService;
    private final GoogleSheetsClient sheetsClient;

    /**
     * 마지막 sync 메타 데이터 (시각 + summary). 메모리 보관 — 부팅 시 초기화 (영속 X).
     * V6 별도 PR 에서 sync_history 테이블로 영속화 예정.
     */
    private final AtomicReference<LastSyncSnapshot> lastSnapshot = new AtomicReference<>(LastSyncSnapshot.empty());

    /**
     * 시트 → DB 수동 sync trigger (옵션 C-3).
     * 캐시 invalidate 후 sync 실행 — 시트 최신값 즉시 반영. 실행 후 lastSnapshot 갱신.
     *
     * @return 응답 envelope 안 SyncSummary (총 insertedRows/updatedRows/softDeletedProductRows/skippedOccurrences + tab 별 분포)
     */
    @Operation(summary = "구글 시트 → DB 수동 sync trigger (옵션 C-3)",
            description = "cron 5분 주기 (옵션 C-2, PR-D Part 1) 와 별개로 시트 변경 즉시 반영이 필요할 때 호출. "
                    + "Caffeine 캐시 invalidate 후 sync 실행 — 시트 read 1회 추가 발생. "
                    + "실행 후 마지막 sync 시각 + summary 메모리 보관 (GET /sync/last 로 조회).")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "sync 성공 (per-tab 결과)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "인증 실패"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "500", description = "시트 read 실패 / Service Account 미설정")
    })
    @PostMapping("/sync")
    @RequirePermission(page = "products.sync", action = PermissionAction.CREATE)
    public ResponseEntity<ApiResponse<ProductSheetSyncService.SyncSummary>> triggerSync() {
        return ResponseEntity.status(HttpStatus.GONE)
                .body(ApiResponse.fail("SHEET_SYNC_DISABLED", "Google Sheets 연동은 폐기되었으며 DB 카탈로그만 사용합니다.", null));
    }

    /**
     * 마지막 sync 메타 데이터 조회 (PR-D Part 1 — admin UI 마지막 sync 시각 표시용).
     * 부팅 후 1번도 trigger 가 없으면 {@code lastSyncAt = null, summary = null}.
     *
     * @return 응답 envelope 안 LastSyncSnapshot (lastSyncAt + summary)
     */
    @Operation(summary = "마지막 시트 sync 메타 데이터 조회 (PR-D Part 1)",
            description = "직전 admin trigger sync (또는 cron 자동 sync 후 trigger) 의 시각 + SyncSummary 반환. "
                    + "메모리 보관 — service 재기동 시 초기화. 영속화는 V6 별도 PR.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공 (sync 1회도 없으면 lastSyncAt=null)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "인증 실패")
    })
    @GetMapping("/sync/last")
    @RequirePermission(page = "products.sync", action = PermissionAction.VIEW)
    public ApiResponse<LastSyncSnapshot> lastSync() {
        return ApiResponse.ok(lastSnapshot.get());
    }

    /**
     * 마지막 sync 메타 데이터 — 메모리 보관용 record.
     *
     * @param lastSyncAt 마지막 sync 시각 (1번도 없으면 null)
     * @param summary 마지막 sync 결과 (1번도 없으면 null)
     */
    public record LastSyncSnapshot(Instant lastSyncAt, ProductSheetSyncService.SyncSummary summary) {
        public static LastSyncSnapshot empty() {
            return new LastSyncSnapshot(null, null);
        }
    }

    /**
     * lookup sync 결과를 기존 admin 응답 타입에 병합한다.
     *
     * <p>관리 endpoint 의 공개 타입은 기존 {@link ProductSheetSyncService.SyncSummary} 를 유지하되,
     * RC9 lookup 3탭 실행 결과도 같은 envelope 에 포함한다.
     *
     * @param summary ProductMaster sync summary
     * @param lookupSummary lookup 3탭 sync summary
     */
    private static void mergeLookupSummary(ProductSheetSyncService.SyncSummary summary,
                                           ProductLookupSheetSyncService.SyncSummary lookupSummary) {
        if (lookupSummary == null) {
            return;
        }
        lookupSummary.byTab.forEach((tabName, lookupTab) -> {
            ProductSheetSyncService.TabSyncResult tab = new ProductSheetSyncService.TabSyncResult();
            tab.insertedRows = lookupTab.insertedRows;
            tab.updatedRows = lookupTab.updatedRows;
            tab.unchangedRows = lookupTab.unchangedRows;
            tab.softDeletedProductRows = lookupTab.softDeletedLookupRows;
            tab.skippedOccurrences = lookupTab.skippedOccurrences;
            tab.error = lookupTab.error;
            summary.byTab.put("lookup:" + tabName, tab);
        });
        summary.totalInsertedRows += lookupSummary.totalInsertedRows;
        summary.totalUpdatedRows += lookupSummary.totalUpdatedRows;
        summary.totalSoftDeletedRows += lookupSummary.totalSoftDeletedLookupRows;
        summary.totalSkippedOccurrences += lookupSummary.totalSkippedOccurrences;
        summary.totalTabs += lookupSummary.totalTabs;
        summary.failedTabs += lookupSummary.failedTabs;
        summary.successfulTabs += lookupSummary.successfulTabs;
        summary.durationMs += lookupSummary.durationMs;
    }
}
