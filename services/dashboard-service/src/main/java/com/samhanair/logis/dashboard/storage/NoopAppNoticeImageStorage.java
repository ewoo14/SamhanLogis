package com.samhanair.logis.dashboard.storage;

import jakarta.annotation.PostConstruct;
import java.io.InputStream;
import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * MinIO 비활성 환경용 no-op fallback.
 *
 * <p>운영류 profile(prod/production/staging/aws)에서 본 Noop 이 활성(=MinIO 미설정)이면 기동 자체를
 * 중단한다. 업로드뿐 아니라 조회(presigned)·기동까지 silent 로 깨지는 것을 막아 운영에서 저장소를 강제한다.
 * dev/test/local 등 비운영 profile 에서는 graceful 하게 동작한다.
 */
@Component
@ConditionalOnMissingBean(MinioAppNoticeImageStorage.class)
public class NoopAppNoticeImageStorage implements AppNoticeImageStorage {

    private static final Logger log = LoggerFactory.getLogger(NoopAppNoticeImageStorage.class);
    private static final String PLACEHOLDER_URL = "about:blank#app-notice-noop";
    // 이미지 누락이 실제 문제인 운영류 profile. 그 외(dev/test/local 등)는 Noop graceful 허용.
    private static final Set<String> OPERATIONAL_PROFILES = Set.of("prod", "production", "staging", "aws");

    private final Environment environment;

    public NoopAppNoticeImageStorage(Environment environment) {
        this.environment = environment;
    }

    /** 운영 profile 에서 MinIO 비활성 시 기동 중단 — 업로드/조회 silent 깨짐을 원천 차단하고 저장소 설정을 강제. */
    @PostConstruct
    void guardOperationalProfile() {
        if (isOperationalProfile()) {
            throw new IllegalStateException(
                    "운영 profile 에서 공지 이미지 저장소(MinIO, app.notice.minio.enabled=true)가 비활성화되어 기동을 중단합니다. "
                            + "활성 profile=" + String.join(",", environment.getActiveProfiles()));
        }
    }

    @Override
    public void upload(String storageKey, String contentType, long size, InputStream data) {
        log.warn("[noop-app-notice-storage] upload skipped — key={} size={} contentType={}",
                storageKey, size, contentType);
    }

    @Override
    public String presignedGetUrl(String storageKey) {
        return PLACEHOLDER_URL;
    }

    private boolean isOperationalProfile() {
        return Arrays.stream(environment.getActiveProfiles())
                .map(profile -> profile.toLowerCase(Locale.ROOT))
                .anyMatch(OPERATIONAL_PROFILES::contains);
    }
}
