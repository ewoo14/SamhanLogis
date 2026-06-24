package com.samhanair.logis.slip.domain.external;

/** 타배송사 발송 채널. 슬3는 SMS만 실행하고 PRINT/BOTH는 후속 인쇄 슬라이스에서 사용한다. */
public enum ExternalDispatchChannel {
    SMS,
    PRINT,
    BOTH
}
