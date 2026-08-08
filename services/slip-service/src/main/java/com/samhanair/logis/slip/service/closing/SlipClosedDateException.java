package com.samhanair.logis.slip.service.closing;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;

public class SlipClosedDateException extends BusinessException {
    public SlipClosedDateException() {
        super(ErrorCode.CONFLICT, "마감된 날짜에는 신규 전표를 만들 수 없습니다.");
    }
}
