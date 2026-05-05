package com.samhanair.logis.partnerorder.scheduler;

import com.samhanair.logis.partnerorder.service.PartnerOrderDraftService;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 30일 TTL 만료 임시저장 cleanup batch — 매일 03:00 KST 실행.
 *
 * <p>설계서 §3.1 — legacy 동작 보존 (30일 후 자동 삭제). soft delete 만 수행, 물리 삭제는 별도 정책.
 */
@Component
@RequiredArgsConstructor
public class DraftCleanupScheduler {

    private static final Logger log = LoggerFactory.getLogger(DraftCleanupScheduler.class);

    private final PartnerOrderDraftService draftService;

    /** 매일 새벽 3시. yml override 가능. */
    @Scheduled(cron = "${samhan.draft.cleanup-cron:0 0 3 * * *}")
    public void cleanupExpired() {
        int affected = draftService.cleanupExpired("system");
        if (affected > 0) {
            log.info("Draft TTL cleanup: {} rows soft-deleted", affected);
        }
    }
}
