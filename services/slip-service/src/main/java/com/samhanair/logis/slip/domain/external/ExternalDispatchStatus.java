package com.samhanair.logis.slip.domain.external;

/** 타배송사 발송 결과 상태. 실패 이력은 보존해 동일 전표 재시도 판단에 사용한다. */
public enum ExternalDispatchStatus {
    SENT,
    FAILED
}
