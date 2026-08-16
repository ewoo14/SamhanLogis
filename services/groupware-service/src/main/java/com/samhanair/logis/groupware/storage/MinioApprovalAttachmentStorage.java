package com.samhanair.logis.groupware.storage;

import io.minio.BucketExistsArgs;
import io.minio.GetObjectArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import jakarta.annotation.PostConstruct;
import java.io.InputStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * 결재 첨부 MinIO storage 구현.
 *
 * <p>{@code samhan.minio.enabled=true} 일 때 활성화한다. 버킷 기본값은
 * {@code groupware-approval-attachments}.
 */
@Component
@ConditionalOnProperty(value = "samhan.minio.enabled", havingValue = "true")
public class MinioApprovalAttachmentStorage implements ApprovalAttachmentStorage {

    private static final Logger log = LoggerFactory.getLogger(MinioApprovalAttachmentStorage.class);

    private final String endpoint;
    private final String accessKey;
    private final String secretKey;
    private final String bucket;

    private MinioClient client;

    public MinioApprovalAttachmentStorage(
            @Value("${samhan.minio.endpoint:http://localhost:9000}") String endpoint,
            @Value("${samhan.minio.access-key}") String accessKey,
            @Value("${samhan.minio.secret-key}") String secretKey,
            @Value("${samhan.minio.groupware-approval-bucket:groupware-approval-attachments}") String bucket) {
        this.endpoint = endpoint;
        this.accessKey = accessKey;
        this.secretKey = secretKey;
        this.bucket = bucket;
    }

    @PostConstruct
    void init() {
        this.client = MinioClient.builder()
                .endpoint(endpoint)
                .credentials(accessKey, secretKey)
                .build();
        try {
            boolean exists = client.bucketExists(BucketExistsArgs.builder().bucket(bucket).build());
            if (!exists) {
                client.makeBucket(MakeBucketArgs.builder().bucket(bucket).build());
                log.info("MinIO bucket created (groupware-service): {}", bucket);
            }
        } catch (Exception ex) {
            log.warn("MinIO bucket init failed (groupware-service, lazy retry): {}", ex.getMessage());
        }
    }

    @Override
    public void put(String storageKey, String contentType, long size, InputStream data) {
        try {
            client.putObject(PutObjectArgs.builder()
                    .bucket(bucket)
                    .object(storageKey)
                    .stream(data, size, -1)
                    .contentType(contentType)
                    .build());
        } catch (Exception ex) {
            throw new IllegalStateException("MinIO 업로드 실패: " + storageKey, ex);
        }
    }

    @Override
    public StoredObject get(String storageKey) {
        try {
            InputStream data = client.getObject(GetObjectArgs.builder()
                    .bucket(bucket)
                    .object(storageKey)
                    .build());
            return new StoredObject(data, "application/octet-stream", -1L);
        } catch (Exception ex) {
            throw new IllegalStateException("MinIO 다운로드 실패: " + storageKey, ex);
        }
    }

    @Override
    public void delete(String storageKey) {
        try {
            client.removeObject(RemoveObjectArgs.builder()
                    .bucket(bucket)
                    .object(storageKey)
                    .build());
        } catch (Exception ex) {
            throw new IllegalStateException("MinIO 삭제 실패: " + storageKey, ex);
        }
    }
}
