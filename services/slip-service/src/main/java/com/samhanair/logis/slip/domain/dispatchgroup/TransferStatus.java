package com.samhanair.logis.slip.domain.dispatchgroup;

/** S1에서는 NOT_SENT만 사용하며 후속 전송 라운드에서 상태를 전이한다. */
public enum TransferStatus {
    NOT_SENT,
    SENT,
    FAILED
}
