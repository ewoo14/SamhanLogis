package com.samhanair.logis.inventory.attachment.storage;

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
 * MinIO (S3 호환) 백엔드 구현 — slip-service {@code MinioSlipAttachmentStorage} 패턴 일관.
 *
 * <p>{@code app.inventory.minio.enabled=true} 일 때만 활성화.
 * 비활성 환경(CI / 단위 테스트) 에서는 {@link NoopInspectionAttachmentStorage} fallback 이 주입.
 *
 * <p>bucket = {@code app.inventory.minio.bucket} (default {@code inspection-attachments})
 * — docker-compose 의 {@code samhan-minio} container. Phase 11 AWS 마이그레이션 시
 * endpoint / credentials 만 S3 값으로 교체.
 */
@Component
@ConditionalOnProperty(value = "app.inventory.minio.enabled", havingValue = "true")
public class MinioInspectionAttachmentStorage implements InspectionAttachmentStorage {

    private static final Logger log = LoggerFactory.getLogger(MinioInspectionAttachmentStorage.class);

    private final String endpoint;
    private final String accessKey;
    private final String secretKey;
    private final String bucket;
    private final int presignedExpirySeconds;

    private MinioClient client;

    /**
     * MinIO 연결 설정 생성자.
     *
     * @param endpoint              MinIO endpoint (default http://localhost:9000)
     * @param accessKey             MinIO access key
     * @param secretKey             MinIO secret key
     * @param bucket                대상 bucket 이름
     * @param presignedExpirySeconds presigned URL 유효 시간(초)
     */
    public MinioInspectionAttachmentStorage(
            @Value("${app.inventory.minio.endpoint:http://localhost:9000}") String endpoint,
            @Value("${app.inventory.minio.access-key}") String accessKey,
            @Value("${app.inventory.minio.secret-key}") String secretKey,
            @Value("${app.inventory.minio.bucket:inspection-attachments}") String bucket,
            @Value("${app.inventory.minio.presigned-expiry-seconds:3600}") int presignedExpirySeconds) {
        this.endpoint = endpoint;
        this.accessKey = accessKey;
        this.secretKey = secretKey;
        this.bucket = bucket;
        this.presignedExpirySeconds = presignedExpirySeconds;
    }

    /** 애플리케이션 기동 시 MinioClient 초기화 + bucket 존재 확인 / 자동 생성. */
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
                log.info("MinIO bucket created (inventory-service): {}", bucket);
            }
        } catch (Exception ex) {
            // 버킷 초기화 실패는 즉시 throw 시 application start 실패 — 로그 후 lazy 처리
            log.warn("MinIO bucket init failed (inventory-service, storage 호출 시 재시도): {}", ex.getMessage());
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
            throw new IllegalStateException("MinIO 업로드 실패 (inspection-service): " + storageKey, ex);
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
            throw new IllegalStateException("MinIO presigned URL 발급 실패 (inspection-service): " + storageKey, ex);
        }
    }
}
