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
    void triggerSync_캐시invalidate_후_syncAll_호출하고_lastSnapshot_갱신() {
        // given
        ProductSheetSyncService.SyncSummary summary = new ProductSheetSyncService.SyncSummary();
        summary.totalInserted = 3;
        summary.totalUpdated = 2;
        summary.totalSoftDeleted = 1;
        ProductLookupSheetSyncService.SyncSummary lookupSummary = new ProductLookupSheetSyncService.SyncSummary();
        ProductLookupSheetSyncService.TabSyncResult lookupTab = new ProductLookupSheetSyncService.TabSyncResult();
        lookupTab.inserted = 4;
        lookupSummary.byTab.put("싱글 자재가격", lookupTab);
        lookupSummary.totalInserted = 4;
        when(syncService.syncAll()).thenReturn(summary);
        when(lookupSyncService.syncAll()).thenReturn(lookupSummary);

        // when
        ApiResponse<ProductSheetSyncService.SyncSummary> response = controller.triggerSync();

        // then — cache invalidate + syncAll 호출 순서 + 응답 페이로드
        verify(sheetsClient).invalidateCache();
        verify(syncService).syncAll();
        verify(lookupSyncService).syncAll();
        assertThat(response.getData().totalInserted).isEqualTo(7);
        assertThat(response.getData().totalUpdated).isEqualTo(2);
        assertThat(response.getData().totalSoftDeleted).isEqualTo(1);
        assertThat(response.getData().byTab).containsKey("lookup:싱글 자재가격");

        // lastSnapshot 도 trigger 후 갱신 — GET /sync/last 가 즉시 시각 + summary 노출
        ApiResponse<ProductAdminController.LastSyncSnapshot> last = controller.lastSync();
        assertThat(last.getData().lastSyncAt()).isNotNull();
        assertThat(last.getData().summary()).isSameAs(summary);
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
