package com.samhanair.logis.slip.attachment.storage;

import io.minio.BucketExistsArgs;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.http.Method;
import jakarta.annotation.PostConstruct;
import java.io.InputStream;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * MinIO (S3 호환) 백엔드 구현 — partner-service 의 MinioAttachmentStorage 패턴 일관.
 *
 * <p>{@code app.slip.minio.enabled=true} 일 때만 활성화.
 *
 * <p>비활성 환경 (CI / 단위 테스트) 에서는 {@link NoopSlipAttachmentStorage} fallback 이 주입.
 *
 * <p>endpoint = {@code app.slip.minio.endpoint} (default {@code http://localhost:9000})
 * — docker-compose 의 {@code samhan-minio} container.
 */
@Component
@ConditionalOnProperty(value = "app.slip.minio.enabled", havingValue = "true")
public class MinioSlipAttachmentStorage implements SlipAttachmentStorage {

    private static final Logger log = LoggerFactory.getLogger(MinioSlipAttachmentStorage.class);

    private final String endpoint;
    private final String accessKey;
    private final String secretKey;
    private final String bucket;
    private final int presignedExpirySeconds;

    private MinioClient client;

    public MinioSlipAttachmentStorage(
            @Value("${app.slip.minio.endpoint:http://localhost:9000}") String endpoint,
            @Value("${app.slip.minio.access-key}") String accessKey,
            @Value("${app.slip.minio.secret-key}") String secretKey,
            @Value("${app.slip.minio.bucket:slip-attachments}") String bucket,
            @Value("${app.slip.minio.presigned-expiry-seconds:3600}") int presignedExpirySeconds) {
        this.endpoint = endpoint;
        this.accessKey = accessKey;
        this.secretKey = secretKey;
        this.bucket = bucket;
        this.presignedExpirySeconds = presignedExpirySeconds;
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
                log.info("MinIO bucket created (slip-service): {}", bucket);
            }
        } catch (Exception ex) {
            // 버킷 초기화 실패는 즉시 throw 시 application start 실패 — 로그 후 lazy 처리
            log.warn("MinIO bucket init failed (slip-service, storage 호출 시 재시도): {}", ex.getMessage());
        }
    }

    @Override
    public void upload(String storageKey, String contentType, long size, InputStream data) {
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
    public String presignedGetUrl(String storageKey) {
        try {
            return client.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
                    .method(Method.GET)
                    .bucket(bucket)
                    .object(storageKey)
                    .expiry(presignedExpirySeconds, TimeUnit.SECONDS)
                    .build());
        } catch (Exception ex) {
            throw new IllegalStateException("MinIO presigned URL 발급 실패: " + storageKey, ex);
        }
    }
}
