package com.samhanair.logis.groupware.storage;

import java.io.InputStream;

/**
 * 결재 첨부 파일 객체 스토리지 추상화.
 *
 * <p>운영/dev 환경은 MinIO 구현을 사용하고, 테스트/로컬 기본값은 Noop 구현으로 부팅 안정성을
 * 보장한다.
 */
public interface ApprovalAttachmentStorage {

    /** 객체 업로드. */
    void put(String storageKey, String contentType, long size, InputStream data);

    /** 객체 다운로드. */
    StoredObject get(String storageKey);

    /** 객체 삭제. */
    void delete(String storageKey);

    /** 다운로드 객체 view. */
    record StoredObject(InputStream data, String contentType, long size) {
    }
}
