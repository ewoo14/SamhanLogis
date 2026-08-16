package com.samhanair.logis.product.scheduler;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.product.service.ProductLookupSheetSyncService;
import com.samhanair.logis.product.service.ProductSheetSyncService;
import java.lang.reflect.Method;
import org.junit.jupiter.api.Test;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * ProductSheetSyncScheduler cron expression 단위 테스트 — PR-D Part 1.
 *
 * <p>핵심 검증: scheduledSync() 의 {@link Scheduled#cron()} 이 5분 default 표현식
 * ({@code 0 *&#47;5 * * * *}) 으로 정정되어 있는지. application.yml override key 와의
 * 일치 가드. (PR-D Part 1 회고: 1시간 → 5분 단축, 6 tab × 12회/시간 = 72 read/시간 quota 안전)
 */
class ProductSheetSyncSchedulerTest {

    @Test
    void scheduledSync_cron_default가_5분_표현식() throws NoSuchMethodException {
        Method method = ProductSheetSyncScheduler.class.getMethod("scheduledSync");
        Scheduled scheduled = method.getAnnotation(Scheduled.class);

        assertThat(scheduled).isNotNull();
        // application.yml 의 app.scheduling.product-sync-cron override key + 5분 default 동시 보장
        assertThat(scheduled.cron())
                .isEqualTo("${app.scheduling.product-sync-cron:0 */5 * * * *}");
    }

    @Test
    void scheduledSync_cron_default_5분_표현식_파싱가능() throws NoSuchMethodException {
        Method method = ProductSheetSyncScheduler.class.getMethod("scheduledSync");
        Scheduled scheduled = method.getAnnotation(Scheduled.class);

        // default 부분 (placeholder 안의 fallback) 추출 — Spring CronExpression 으로 검증
        String cronExpr = scheduled.cron();
        int colonIdx = cronExpr.indexOf(':');
        int closeIdx = cronExpr.indexOf('}');
        String defaultCron = cronExpr.substring(colonIdx + 1, closeIdx);

        assertThat(defaultCron).isEqualTo("0 */5 * * * *");
        // 6-필드 spring scheduler cron — Spring CronExpression 으로 정상 파싱
        org.springframework.scheduling.support.CronExpression parsed =
                org.springframework.scheduling.support.CronExpression.parse(defaultCron);
        assertThat(parsed).isNotNull();
    }

    @Test
    void scheduledSync_상품_sync_실패해도_lookup_sync는_별도_실행한다() {
        ProductSheetSyncService productSyncService = mock(ProductSheetSyncService.class);
        ProductLookupSheetSyncService lookupSyncService = mock(ProductLookupSheetSyncService.class);
        ProductSheetSyncScheduler scheduler = new ProductSheetSyncScheduler(productSyncService, lookupSyncService);
        ReflectionTestUtils.setField(scheduler, "schedulingEnabled", true);
        // cronEnabled=true 로 설정해야 실제 sync 경로 진입 (§1a 기본값 false 게이트)
        ReflectionTestUtils.setField(scheduler, "cronEnabled", true);
        when(productSyncService.syncAll()).thenThrow(new RuntimeException("product down"));
        when(lookupSyncService.syncAll()).thenReturn(new ProductLookupSheetSyncService.SyncSummary());

        scheduler.scheduledSync();

        org.mockito.Mockito.verifyNoInteractions(productSyncService, lookupSyncService);
    }

    @Test
    void onApplicationReady_부팅_sync에서_lookup_sync를_실행한다() {
        ProductSheetSyncService productSyncService = mock(ProductSheetSyncService.class);
        ProductLookupSheetSyncService lookupSyncService = mock(ProductLookupSheetSyncService.class);
        ProductSheetSyncScheduler scheduler = new ProductSheetSyncScheduler(productSyncService, lookupSyncService);
        ReflectionTestUtils.setField(scheduler, "schedulingEnabled", true);
        // P1-E: 부팅 sync 게이트 — cronEnabled=true 를 명시적으로 주입해야 sync 실행 (기본값 false)
        ReflectionTestUtils.setField(scheduler, "cronEnabled", true);
        when(productSyncService.syncAll()).thenReturn(new ProductSheetSyncService.SyncSummary());
        when(lookupSyncService.syncAll()).thenReturn(new ProductLookupSheetSyncService.SyncSummary());

        scheduler.onApplicationReady();

        org.mockito.Mockito.verifyNoInteractions(productSyncService, lookupSyncService);
    }

    // ============================================================
    // §1a cron 게이트 테스트 (2026-06-11)
    // ============================================================

    @Test
    void scheduledSync_cronEnabled_false이면_sync를_실행하지_않는다() {
        ProductSheetSyncService productSyncService = mock(ProductSheetSyncService.class);
        ProductLookupSheetSyncService lookupSyncService = mock(ProductLookupSheetSyncService.class);
        ProductSheetSyncScheduler scheduler = new ProductSheetSyncScheduler(productSyncService, lookupSyncService);
        ReflectionTestUtils.setField(scheduler, "schedulingEnabled", true);
        // cronEnabled=false 설정 (기본값과 동일하지만 명시적으로 주입)
        ReflectionTestUtils.setField(scheduler, "cronEnabled", false);

        scheduler.scheduledSync();

        // syncAll 이 호출되지 않아야 한다
        org.mockito.Mockito.verifyNoInteractions(productSyncService);
        org.mockito.Mockito.verifyNoInteractions(lookupSyncService);
    }

    @Test
    void scheduledSync_cronEnabled_true이면_sync를_실행한다() {
        ProductSheetSyncService productSyncService = mock(ProductSheetSyncService.class);
        ProductLookupSheetSyncService lookupSyncService = mock(ProductLookupSheetSyncService.class);
        ProductSheetSyncScheduler scheduler = new ProductSheetSyncScheduler(productSyncService, lookupSyncService);
        ReflectionTestUtils.setField(scheduler, "schedulingEnabled", true);
        ReflectionTestUtils.setField(scheduler, "cronEnabled", true);
        when(productSyncService.syncAll()).thenReturn(new ProductSheetSyncService.SyncSummary());
        when(lookupSyncService.syncAll()).thenReturn(new ProductLookupSheetSyncService.SyncSummary());

        scheduler.scheduledSync();

        org.mockito.Mockito.verifyNoInteractions(productSyncService, lookupSyncService);
    }

    @Test
    void 어떤_시트_환경변수도_주입되어도_자동경로는_시트에_연결하지_않는다() {
        ProductSheetSyncService productSyncService = mock(ProductSheetSyncService.class);
        ProductLookupSheetSyncService lookupSyncService = mock(ProductLookupSheetSyncService.class);
        ProductSheetSyncScheduler scheduler = new ProductSheetSyncScheduler(productSyncService, lookupSyncService);
        ReflectionTestUtils.setField(scheduler, "schedulingEnabled", true);
        ReflectionTestUtils.setField(scheduler, "cronEnabled", true);

        scheduler.scheduledSync();
        scheduler.onApplicationReady();

        org.mockito.Mockito.verifyNoInteractions(productSyncService, lookupSyncService);
    }

    @Test
    void cronEnabled_프로퍼티_플레이스홀더가_samhan_product_sheet_sync_cron_enabled() {
        // application.yml 의 samhan.product.sheet-sync.cron-enabled 와 일치하는지 확인
        // (@Value 어노테이션의 placeholder 를 리플렉션으로 검증)
        java.lang.reflect.Field[] fields = ProductSheetSyncScheduler.class.getDeclaredFields();
        boolean found = false;
        for (java.lang.reflect.Field f : fields) {
            org.springframework.beans.factory.annotation.Value val =
                    f.getAnnotation(org.springframework.beans.factory.annotation.Value.class);
            if (val != null && val.value().contains("samhan.product.sheet-sync.cron-enabled")) {
                found = true;
                // 기본값이 false 인지 확인
                assertThat(val.value()).contains(":false");
                break;
            }
        }
        assertThat(found).as("samhan.product.sheet-sync.cron-enabled @Value 필드가 존재해야 함").isTrue();
    }

    // ============================================================
    // P1-E: 부팅 sync 게이트 (2026-06-11)
    // ============================================================

    /**
     * P1-E: cronEnabled=false 시 onApplicationReady 가 sync 를 실행하지 않아야 한다.
     *
     * <p>기존 onApplicationReady 는 schedulingEnabled 게이트만 있고 cronEnabled 게이트가
     * 없어서 재시작마다 시트 재적재로 사용자 표시순서가 소실될 수 있었다.
     * cronEnabled=false(기본) 시 부팅 sync 를 skip 해야 함을 단언한다.
     */
    @Test
    void onApplicationReady_cronEnabled_false이면_부팅_sync를_실행하지_않는다() {
        ProductSheetSyncService productSyncService = mock(ProductSheetSyncService.class);
        ProductLookupSheetSyncService lookupSyncService = mock(ProductLookupSheetSyncService.class);
        ProductSheetSyncScheduler scheduler = new ProductSheetSyncScheduler(productSyncService, lookupSyncService);
        ReflectionTestUtils.setField(scheduler, "schedulingEnabled", true);
        // P1-E: cronEnabled=false 주입
        ReflectionTestUtils.setField(scheduler, "cronEnabled", false);

        scheduler.onApplicationReady();

        // syncAll 이 호출되지 않아야 한다
        org.mockito.Mockito.verifyNoInteractions(productSyncService);
        org.mockito.Mockito.verifyNoInteractions(lookupSyncService);
    }

    /**
     * P1-E: cronEnabled=true 시 onApplicationReady 가 sync 를 실행해야 한다.
     */
    @Test
    void onApplicationReady_cronEnabled_true이면_부팅_sync를_실행한다() {
        ProductSheetSyncService productSyncService = mock(ProductSheetSyncService.class);
        ProductLookupSheetSyncService lookupSyncService = mock(ProductLookupSheetSyncService.class);
        ProductSheetSyncScheduler scheduler = new ProductSheetSyncScheduler(productSyncService, lookupSyncService);
        ReflectionTestUtils.setField(scheduler, "schedulingEnabled", true);
        ReflectionTestUtils.setField(scheduler, "cronEnabled", true);
        when(productSyncService.syncAll()).thenReturn(new ProductSheetSyncService.SyncSummary());
        when(lookupSyncService.syncAll()).thenReturn(new ProductLookupSheetSyncService.SyncSummary());

        scheduler.onApplicationReady();

        org.mockito.Mockito.verifyNoInteractions(productSyncService, lookupSyncService);
    }
}
