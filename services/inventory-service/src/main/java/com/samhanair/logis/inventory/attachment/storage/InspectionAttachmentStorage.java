package com.samhanair.logis.inventory.attachment.storage;

import java.io.InputStream;

/**
 * 검수 사진 스토리지 추상화 — MinIO (S3 호환) 또는 Noop fallback.
 *
 * <p>{@code app.inventory.minio.enabled=true} 이면 {@link MinioInspectionAttachmentStorage},
 * 아니면 {@link NoopInspectionAttachmentStorage} 가 주입된다.
 *
 * <p>slip-service 의 {@code SlipAttachmentStorage}, partner-service 의
 * {@code AttachmentStorage} 와 동일 패턴 일관.
 */
public interface InspectionAttachmentStorage {

    /**
     * 객체를 스토리지에 업로드한다.
     *
     * @param storageKey  MinIO object key (예: "inspection-attachments/{id}/{uuid}.jpg")
     * @param contentType MIME 문자열
     * @param size        바이트 크기
     * @param data        파일 InputStream
     */
    void upload(String storageKey, String contentType, long size, InputStream data);

    /**
     * 객체의 presigned 다운로드 URL 을 발급한다.
     *
     * @param storageKey MinIO object key
     * @return presigned GET URL (기본 1시간 유효)
     */
    String presignedGetUrl(String storageKey);
}
