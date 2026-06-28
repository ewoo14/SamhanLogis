package com.samhanair.logis.dashboard.storage;

import java.io.InputStream;

/** 팝업공지 이미지 객체 스토리지 추상화. */
public interface AppNoticeImageStorage {

    /**
     * 객체 업로드.
     *
     * @param storageKey MinIO object key
     * @param contentType MIME
     * @param size byte 크기
     * @param data 입력 stream
     */
    void upload(String storageKey, String contentType, long size, InputStream data);

    /**
     * presigned GET URL 발급.
     *
     * @param storageKey MinIO object key
     * @return presigned URL
     */
    String presignedGetUrl(String storageKey);
}
