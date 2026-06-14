package com.samhanair.logis.groupware.storage;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.stereotype.Component;

/**
 * 결재 첨부 Noop storage.
 *
 * <p>MinIO 미설정 환경에서 upload/download/delete 호출을 안전하게 처리하는 fallback 이다.
 */
@Component
@ConditionalOnMissingBean(MinioApprovalAttachmentStorage.class)
public class NoopApprovalAttachmentStorage implements ApprovalAttachmentStorage {

    private static final Logger log = LoggerFactory.getLogger(NoopApprovalAttachmentStorage.class);

    @Override
    public void put(String storageKey, String contentType, long size, InputStream data) {
        log.warn("[noop-approval-storage] put skipped — key={} size={} contentType={}",
                storageKey, size, contentType);
    }

    @Override
    public StoredObject get(String storageKey) {
        log.warn("[noop-approval-storage] get empty object — key={}", storageKey);
        return new StoredObject(new ByteArrayInputStream(new byte[0]), "application/octet-stream", 0L);
    }

    @Override
    public void delete(String storageKey) {
        log.warn("[noop-approval-storage] delete skipped — key={}", storageKey);
    }
}
