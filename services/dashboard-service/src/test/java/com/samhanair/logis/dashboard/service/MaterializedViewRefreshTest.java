package com.samhanair.logis.dashboard.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * MaterializedViewRefreshService 단위 테스트 — Phase 9 W4 (2 case).
 *
 * <ol>
 *   <li>refreshAll — 양쪽 view 정상 native query 호출 → 양쪽 true</li>
 *   <li>fail-soft — refresh native query 예외 시 false 반환 (예외 미전파)</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class MaterializedViewRefreshTest {

    @Mock
    private EntityManager entityManager;
    @Mock
    private Query query;

    @InjectMocks
    private MaterializedViewRefreshService service;

    @Test
    void refreshAll_invokes_native_for_both_views() {
        ReflectionTestUtils.setField(service, "entityManager", entityManager);
        when(entityManager.createNativeQuery(contains("REFRESH MATERIALIZED VIEW")))
                .thenReturn(query);
        when(query.executeUpdate()).thenReturn(0);

        MaterializedViewRefreshService.RefreshResult result = service.refreshAll();

        assertThat(result.realtimeStockOk()).isTrue();
        assertThat(result.salesDailyOk()).isTrue();
        verify(entityManager, times(2)).createNativeQuery(contains("REFRESH MATERIALIZED VIEW"));
    }

    @Test
    void refresh_fail_soft_returns_false_on_exception() {
        ReflectionTestUtils.setField(service, "entityManager", entityManager);
        when(entityManager.createNativeQuery(contains(MaterializedViewRefreshService.MV_REALTIME_STOCK_SUMMARY)))
                .thenReturn(query);
        when(entityManager.createNativeQuery(contains(MaterializedViewRefreshService.MV_SALES_DAILY_SUMMARY)))
                .thenReturn(query);
        when(query.executeUpdate())
                .thenReturn(0)            // first view ok
                .thenThrow(new RuntimeException("simulated db error"));  // second fails

        MaterializedViewRefreshService.RefreshResult result = service.refreshAll();

        // 첫 번째 view 는 ok, 두 번째 fail-soft (false)
        assertThat(result.realtimeStockOk()).isTrue();
        assertThat(result.salesDailyOk()).isFalse();
    }
}
