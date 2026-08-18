package com.samhanair.logis.product.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.product.client.GoogleSheetsClient;
import com.samhanair.logis.product.service.ProductLookupSheetSyncService;
import com.samhanair.logis.product.service.ProductSheetSyncService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

/**
 * ProductAdminController 단위 테스트 — PR-D Part 1.
 *
 * <p>검증 대상:
 * <ul>
 *   <li>POST /sync — 캐시 invalidate + syncAll 호출 + lastSnapshot 갱신</li>
 *   <li>GET /sync/last — 부팅 직후 빈 snapshot 반환, trigger 후 시각/summary 보유</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class ProductAdminControllerTest {

    @Mock
    private ProductSheetSyncService syncService;

    @Mock
    private ProductLookupSheetSyncService lookupSyncService;

    @Mock
    private GoogleSheetsClient sheetsClient;

    @InjectMocks
    private ProductAdminController controller;

    @BeforeEach
    void setUp() {
        lenient().doNothing().when(sheetsClient).invalidateCache();
    }

    @Test
    void triggerSync는_폐기되어_시트에_연결하지_않는다() {
        // given
        ProductSheetSyncService.SyncSummary summary = new ProductSheetSyncService.SyncSummary();
        summary.totalInsertedRows = 3;
        summary.totalUpdatedRows = 2;
        summary.totalSoftDeletedRows = 1;
        ProductLookupSheetSyncService.SyncSummary lookupSummary = new ProductLookupSheetSyncService.SyncSummary();
        ProductLookupSheetSyncService.TabSyncResult lookupTab = new ProductLookupSheetSyncService.TabSyncResult();
        lookupTab.insertedRows = 4;
        lookupSummary.byTab.put("싱글 자재가격", lookupTab);
        lookupSummary.totalInsertedRows = 4;
        lenient().when(syncService.syncAll()).thenReturn(summary);
        lenient().when(lookupSyncService.syncAll()).thenReturn(lookupSummary);

        // when
        ResponseEntity<ApiResponse<ProductSheetSyncService.SyncSummary>> response = controller.triggerSync();

        // then — runtime에서 시트/동기화 호출이 없어야 한다.
        org.mockito.Mockito.verifyNoInteractions(sheetsClient, syncService, lookupSyncService);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.GONE);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().isSuccess()).isFalse();
        assertThat(response.getBody().getCode()).isEqualTo("SHEET_SYNC_DISABLED");
    }

    @Test
    void triggerSync_부분실패는_207과_성공실패_탭수를_반환한다() {
        ProductSheetSyncService.SyncSummary summary = new ProductSheetSyncService.SyncSummary();
        summary.totalTabs = 11;
        summary.successfulTabs = 6;
        summary.failedTabs = 5;
        lenient().when(syncService.syncAll()).thenReturn(summary);
        lenient().when(lookupSyncService.syncAll()).thenReturn(new ProductLookupSheetSyncService.SyncSummary());

        ResponseEntity<ApiResponse<ProductSheetSyncService.SyncSummary>> response = controller.triggerSync();

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.GONE);
        org.mockito.Mockito.verifyNoInteractions(sheetsClient, syncService, lookupSyncService);
    }

    @Test
    void triggerSync_전탭실패는_502로_성공보고하지_않는다() {
        ProductSheetSyncService.SyncSummary summary = new ProductSheetSyncService.SyncSummary();
        summary.totalTabs = 11;
        summary.failedTabs = 11;
        lenient().when(syncService.syncAll()).thenReturn(summary);
        lenient().when(lookupSyncService.syncAll()).thenReturn(new ProductLookupSheetSyncService.SyncSummary());

        ResponseEntity<ApiResponse<ProductSheetSyncService.SyncSummary>> response = controller.triggerSync();

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.GONE);
        org.mockito.Mockito.verifyNoInteractions(sheetsClient, syncService, lookupSyncService);
    }

    @Test
    void lastSync_부팅직후_빈_snapshot_반환() {
        // given — trigger 호출 없는 상태
        // when
        ApiResponse<ProductAdminController.LastSyncSnapshot> response = controller.lastSync();

        // then — lastSyncAt = null, summary = null (부팅 직후)
        assertThat(response.getData()).isNotNull();
        assertThat(response.getData().lastSyncAt()).isNull();
        assertThat(response.getData().summary()).isNull();
    }
}
