package com.samhanair.logis.slip.domain.external;

/** 타배송사 발송 채널. PRINT 는 인쇄 의뢰서, BOTH 는 SMS 와 인쇄 의뢰서를 함께 생성한다. */
public enum ExternalDispatchChannel {
    SMS,
    PRINT,
    BOTH
}
