package com.samhanair.logis.dashboard.storage;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
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

/** MinIO(S3 호환) 팝업공지 이미지 storage 구현. */
@Component
@ConditionalOnProperty(value = "app.notice.minio.enabled", havingValue = "true")
public class MinioAppNoticeImageStorage implements AppNoticeImageStorage {

    private static final Logger log = LoggerFactory.getLogger(MinioAppNoticeImageStorage.class);

    private final String endpoint;
    private final String accessKey;
    private final String secretKey;
    private final String bucket;
    private final int presignedExpirySeconds;

    private MinioClient client;

    public MinioAppNoticeImageStorage(
            @Value("${app.notice.minio.endpoint:http://localhost:9000}") String endpoint,
            @Value("${app.notice.minio.access-key}") String accessKey,
            @Value("${app.notice.minio.secret-key:}") String secretKey,
            @Value("${app.notice.minio.bucket:samhan-attachments}") String bucket,
            @Value("${app.notice.minio.presigned-expiry-seconds:300}") int presignedExpirySeconds) {
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
                log.info("MinIO bucket created (dashboard-service app notices): {}", bucket);
            }
        } catch (Exception ex) {
            log.warn("MinIO bucket init failed (dashboard-service app notices): {}", ex.getMessage());
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
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "공지 이미지 업로드 저장소 오류", ex);
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
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "공지 이미지 URL 발급 실패", ex);
        }
    }
}
