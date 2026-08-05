package com.samhanair.logis.slip.domain.dispatchgroup;

/** 아로로지스 전송 상태. PENDING은 원격 결과 확인 전까지 사용자 변경을 잠그는 상태다. */
public enum TransferStatus {
    NOT_SENT,
    SENT,
    FAILED,
    PENDING
}
