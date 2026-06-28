package com.samhanair.logis.dashboard.storage;

import java.io.InputStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.stereotype.Component;

/** MinIO 비활성 환경용 no-op fallback. */
@Component
@ConditionalOnMissingBean(MinioAppNoticeImageStorage.class)
public class NoopAppNoticeImageStorage implements AppNoticeImageStorage {

    private static final Logger log = LoggerFactory.getLogger(NoopAppNoticeImageStorage.class);

    @Override
    public void upload(String storageKey, String contentType, long size, InputStream data) {
        log.warn("[noop-app-notice-storage] upload skipped — key={} size={} contentType={}",
                storageKey, size, contentType);
    }

    @Override
    public String presignedGetUrl(String storageKey) {
        return "noop://app-notices/" + storageKey;
    }
}
