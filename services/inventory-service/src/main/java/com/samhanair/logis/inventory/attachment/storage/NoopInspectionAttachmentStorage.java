package com.samhanair.logis.inventory.attachment.storage;

import java.io.InputStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Noop (no-operation) 스토리지 — CI / 단위 테스트 / MinIO 비활성 환경 fallback.
 *
 * <p>{@code app.inventory.minio.enabled} 가 {@code true} 가 아닐 때 기본 주입.
 * upload 는 아무 동작 없이 성공 반환, presignedGetUrl 은 빈 문자열 반환.
 */
@Component
@ConditionalOnProperty(value = "app.inventory.minio.enabled", havingValue = "false",
        matchIfMissing = true)
public class NoopInspectionAttachmentStorage implements InspectionAttachmentStorage {

    private static final Logger log = LoggerFactory.getLogger(NoopInspectionAttachmentStorage.class);

    @Override
    public void upload(String storageKey, String contentType, long size, InputStream data) {
        log.debug("NoopInspectionAttachmentStorage.upload — storageKey={}, size={}", storageKey, size);
    }

    @Override
    public String presignedGetUrl(String storageKey) {
        log.debug("NoopInspectionAttachmentStorage.presignedGetUrl — storageKey={}", storageKey);
        return "";
    }
}
