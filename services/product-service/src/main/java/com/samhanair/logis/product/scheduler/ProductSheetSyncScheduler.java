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
 * 구글 시트 → DB 동기화 스케줄러 (옵션 C-2 + C-3 결합).
 *
 * <p><b>출처</b>: 개발책임자 결정 2026-05-05 — 옵션 C-2 (cron 5분 주기) 채택.
 * 옵션 C-1 (실시간 read) 부하 / 시트 API quota 한계 → 기각.
 * 옵션 C-3 (admin endpoint) 는 본 scheduler 와 결합 (수동 trigger).
 *
 * <p><b>cron 활성 게이트 (2026-06-11 개발책임자 확정)</b>:
 * {@code samhan.product.sheet-sync.cron-enabled} 가 {@code true} 일 때만 자동 cron 실행.
 * 기본값 {@code false} — 구글 시트는 최초 시드 전용으로, 자동 주기 sync 는 기본 비활성.
 * 시드 재적재 비상 수단으로 수동 trigger(POST /api/v1/products/admin/sync)만 유지한다.
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
 * <p><b>활성 조건</b>: {@code app.scheduling.enabled=true} (default true) +
 * {@code samhan.product.sheet-sync.cron-enabled=true} 둘 다 true 일 때만 cron 실행.
 * 테스트 환경에서 application.yml profile=local 로 false override 가능.
 */
@Component
public class ProductSheetSyncScheduler {

    private static final Logger log = LoggerFactory.getLogger(ProductSheetSyncScheduler.class);

    private final ProductSheetSyncService syncService;
    private final ProductLookupSheetSyncService lookupSyncService;

    @Value("${app.scheduling.enabled:true}")
    private boolean schedulingEnabled;

    /**
     * 자동 cron 게이트 — {@code samhan.product.sheet-sync.cron-enabled} 기본 {@code false}.
     *
     * <p>구글 시트는 최초 시드 재적재 비상 수단 전용이므로 자동 cron 은 기본 비활성.
     * 수동 trigger(POST /api/v1/products/admin/sync)는 본 flag 와 무관하게 항시 유효.
     */
    @Value("${samhan.product.sheet-sync.cron-enabled:false}")
    private boolean cronEnabled;

    public ProductSheetSyncScheduler(ProductSheetSyncService syncService,
                                     ProductLookupSheetSyncService lookupSyncService) {
        this.syncService = syncService;
        this.lookupSyncService = lookupSyncService;
    }

    /**
     * cron 5분 주기 sync — 매 5분 (PR-D Part 1 정정).
     * cron expression 은 application.yml 에서 override 가능.
     * 6 tab × 12회/시간 = 72 read/시간 → 시트 API quota 60 read/min 안전 마진 50배.
     *
     * <p>자동 실행 조건: {@code app.scheduling.enabled=true} AND
     * {@code samhan.product.sheet-sync.cron-enabled=true} 양쪽 모두 true 이어야 함.
     * 수동 trigger(POST /api/v1/products/admin/sync)는 본 메서드를 거치지 않으므로
     * {@code cronEnabled} 게이트 영향을 받지 않는다.
     */
    @Scheduled(cron = "${app.scheduling.product-sync-cron:0 */5 * * * *}")
    public void scheduledSync() {
        if (!schedulingEnabled) {
            log.debug("[ProductSheetSyncScheduler] scheduling 비활성 — skip");
            return;
        }
        if (!cronEnabled) {
            log.debug("[ProductSheetSyncScheduler] cron-enabled=false — 자동 sync skip (수동 trigger 전용)");
            return;
        }
        log.info("[ProductSheetSyncScheduler] cron sync trigger");
        runProductSyncForCron();
        runLookupSyncForCron();
    }

    /** 기존 6카테고리 상품 sync 를 cron 경로에서 독립 실행한다. */
    private void runProductSyncForCron() {
        try {
            ProductSheetSyncService.SyncSummary summary = syncService.syncAll();
            log.info("[ProductSheetSyncScheduler] cron product sync 완료: inserted={}, updated={}, softDeleted={}",
                    summary.totalInsertedRows, summary.totalUpdatedRows, summary.totalSoftDeletedRows);
        } catch (Exception e) {
            log.error("[ProductSheetSyncScheduler] cron product sync 실패: {}", e.getMessage(), e);
        }
    }

    /** lookup 3종 sync 를 cron 경로에서 독립 실행한다. */
    private void runLookupSyncForCron() {
        try {
            ProductLookupSheetSyncService.SyncSummary summary = lookupSyncService.syncAll();
            log.info("[ProductSheetSyncScheduler] cron lookup sync 완료: inserted={}, updated={}, softDeleted={}",
                    summary.totalInserted, summary.totalUpdated, summary.totalSoftDeleted);
        } catch (Exception e) {
            log.error("[ProductSheetSyncScheduler] cron lookup sync 실패: {}", e.getMessage(), e);
        }
    }

    /**
     * 부팅 시 1회 sync — Spring 컨텍스트 ready 직후.
     * Service Account JSON 부재 등으로 실패해도 catch + log (부팅 차단 X).
     *
     * <p><b>P1-E cron 게이트 (2026-06-11)</b>:
     * 부팅 sync 도 동일 게이트 적용 ({@code samhan.product.sheet-sync.cron-enabled}).
     * 기본 {@code false} — 재시작마다 시트 재적재로 사용자 표시순서 소실을 방지.
     * 수동 트리거(POST /api/v1/products/admin/sync)만 사용한다.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void onApplicationReady() {
        if (!schedulingEnabled) {
            log.info("[ProductSheetSyncScheduler] scheduling 비활성 — 부팅 sync skip");
            return;
        }
        if (!cronEnabled) {
            log.info("[ProductSheetSyncScheduler] cron-enabled=false — 부팅 sync skip (수동 trigger 전용)");
            return;
        }
        log.info("[ProductSheetSyncScheduler] 부팅 시 1회 sync trigger");
        runProductSyncForBoot();
        runLookupSyncForBoot();
    }

    /** 기존 6카테고리 상품 sync 를 부팅 경로에서 독립 실행한다. */
    private void runProductSyncForBoot() {
        try {
            ProductSheetSyncService.SyncSummary summary = syncService.syncAll();
            log.info("[ProductSheetSyncScheduler] 부팅 product sync 완료: inserted={}, updated={}, softDeleted={}",
                    summary.totalInsertedRows, summary.totalUpdatedRows, summary.totalSoftDeletedRows);
        } catch (Exception e) {
            log.warn("[ProductSheetSyncScheduler] 부팅 product sync 실패 (cron 으로 재시도): {}", e.getMessage());
        }
    }

    /** lookup 3종 sync 를 부팅 경로에서 독립 실행한다. */
    private void runLookupSyncForBoot() {
        try {
            ProductLookupSheetSyncService.SyncSummary summary = lookupSyncService.syncAll();
            log.info("[ProductSheetSyncScheduler] 부팅 lookup sync 완료: inserted={}, updated={}, softDeleted={}",
                    summary.totalInserted, summary.totalUpdated, summary.totalSoftDeleted);
        } catch (Exception e) {
            log.warn("[ProductSheetSyncScheduler] 부팅 lookup sync 실패 (cron 으로 재시도): {}", e.getMessage());
        }
    }
}
