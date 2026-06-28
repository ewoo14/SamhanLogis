package com.samhanair.logis.dashboard.storage;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.io.InputStream;
import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/** MinIO 비활성 환경용 no-op fallback. */
@Component
@ConditionalOnMissingBean(MinioAppNoticeImageStorage.class)
public class NoopAppNoticeImageStorage implements AppNoticeImageStorage {

    private static final Logger log = LoggerFactory.getLogger(NoopAppNoticeImageStorage.class);
    private static final String PLACEHOLDER_URL = "about:blank#app-notice-noop";
    private static final Set<String> SAFE_NOOP_PROFILES = Set.of("local", "test", "default");

    private final Environment environment;

    public NoopAppNoticeImageStorage(Environment environment) {
        this.environment = environment;
    }

    @Override
    public void upload(String storageKey, String contentType, long size, InputStream data) {
        if (isOperationalProfile()) {
            throw new BusinessException(
                    ErrorCode.INTERNAL_ERROR,
                    "공지 이미지 저장소(MinIO)가 비활성화되어 업로드할 수 없습니다.");
        }
        log.warn("[noop-app-notice-storage] upload skipped — key={} size={} contentType={}",
                storageKey, size, contentType);
    }

    @Override
    public String presignedGetUrl(String storageKey) {
        return PLACEHOLDER_URL;
    }

    private boolean isOperationalProfile() {
        String[] activeProfiles = environment.getActiveProfiles();
        if (activeProfiles.length == 0) {
            return false;
        }
        return Arrays.stream(activeProfiles)
                .map(profile -> profile.toLowerCase(Locale.ROOT))
                .anyMatch(profile -> !SAFE_NOOP_PROFILES.contains(profile));
    }
}
