package com.samhanair.logis.product.scheduler;

import com.samhanair.logis.product.service.ProductSheetSyncService;
import com.samhanair.logis.product.service.ProductLookupSheetSyncService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 구글 시트 → DB 동기화 스케줄러 (옵션 C-2).
 *
 * <p><b>출처</b>: 개발책임자 결정 2026-05-05 — 옵션 C-2 (cron 1시간 주기) 채택.
 * 옵션 C-1 (실시간 read) 부하 / 시트 API quota 한계 → 기각.
 * 옵션 C-3 (admin endpoint) 는 본 scheduler 와 결합 (수동 trigger).
 *
 * <p><b>주기</b>: {@code app.scheduling.product-sync-cron} (default {@code 0 *&#47;5 * * * *} —
 * 매 5분, PR-D Part 1 정정). spring scheduler cron 6-필드 (sec/min/hour/dom/month/dow).
 *
 * <p><b>quota 검증</b>: 6 tab × 12회/시간 = 72 read/시간 = 1.2/min. Sheets API quota 60 read/min/user
 * 안전 (50배 마진). 1시간 → 5분 단축으로 시트 갱신 반영 지연 평균 30분 → 2.5분 단축.
 *
 * <p><b>부팅 시 1회</b>: {@link ApplicationReadyEvent} 시 즉시 sync 실행.
 * 시트 API / Service Account 미가용 환경에서는 catch + log (부팅 차단 X).
 *
 * <p><b>활성 조건</b>: {@code app.scheduling.enabled=true} (default true). 테스트 환경에서
 * application.yml profile=local 로 false override 가능.
 */
@Component
public class ProductSheetSyncScheduler {

    private static final Logger log = LoggerFactory.getLogger(ProductSheetSyncScheduler.class);

    private final ProductSheetSyncService syncService;
    private final ProductLookupSheetSyncService lookupSyncService;

    @Value("${app.scheduling.enabled:true}")
    private boolean schedulingEnabled;

    public ProductSheetSyncScheduler(ProductSheetSyncService syncService,
                                     ProductLookupSheetSyncService lookupSyncService) {
        this.syncService = syncService;
        this.lookupSyncService = lookupSyncService;
    }

    /**
     * cron 5분 주기 sync — 매 5분 (PR-D Part 1 정정).
     * cron expression 은 application.yml 에서 override 가능.
     * 6 tab × 12회/시간 = 72 read/시간 → 시트 API quota 60 read/min 안전 마진 50배.
     */
    @Scheduled(cron = "${app.scheduling.product-sync-cron:0 */5 * * * *}")
    public void scheduledSync() {
        if (!schedulingEnabled) {
            log.debug("[ProductSheetSyncScheduler] scheduling 비활성 — skip");
            return;
        }
        log.info("[ProductSheetSyncScheduler] cron sync trigger");
        try {
            ProductSheetSyncService.SyncSummary summary = syncService.syncAll();
            ProductLookupSheetSyncService.SyncSummary lookupSummary = lookupSyncService.syncAll();
            log.info("[ProductSheetSyncScheduler] cron sync 완료: product(inserted={}, updated={}, softDeleted={}), "
                            + "lookup(inserted={}, updated={}, softDeleted={})",
                    summary.totalInserted, summary.totalUpdated, summary.totalSoftDeleted,
                    lookupSummary.totalInserted, lookupSummary.totalUpdated, lookupSummary.totalSoftDeleted);
        } catch (Exception e) {
            log.error("[ProductSheetSyncScheduler] cron sync 실패: {}", e.getMessage(), e);
        }
    }

    /**
     * 부팅 시 1회 sync — Spring 컨텍스트 ready 직후.
     * Service Account JSON 부재 등으로 실패해도 catch + log (부팅 차단 X).
     */
    @EventListener(ApplicationReadyEvent.class)
    public void onApplicationReady() {
        if (!schedulingEnabled) {
            log.info("[ProductSheetSyncScheduler] scheduling 비활성 — 부팅 sync skip");
            return;
        }
        log.info("[ProductSheetSyncScheduler] 부팅 시 1회 sync trigger");
        try {
            ProductSheetSyncService.SyncSummary summary = syncService.syncAll();
            ProductLookupSheetSyncService.SyncSummary lookupSummary = lookupSyncService.syncAll();
            log.info("[ProductSheetSyncScheduler] 부팅 sync 완료: product(inserted={}, updated={}, softDeleted={}), "
                            + "lookup(inserted={}, updated={}, softDeleted={})",
                    summary.totalInserted, summary.totalUpdated, summary.totalSoftDeleted,
                    lookupSummary.totalInserted, lookupSummary.totalUpdated, lookupSummary.totalSoftDeleted);
        } catch (Exception e) {
            log.warn("[ProductSheetSyncScheduler] 부팅 sync 실패 (cron 으로 재시도): {}", e.getMessage());
        }
    }
}
