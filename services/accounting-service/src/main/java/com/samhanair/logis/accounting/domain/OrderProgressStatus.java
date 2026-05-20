package com.samhanair.logis.accounting.domain;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;

/** MIG-8 주문 진행상태. */
public enum OrderProgressStatus {
    COMPLETED,
    IN_PROGRESS,
    CANCELED,
    PENDING;

    public static OrderProgressStatus fromKorean(String value) {
        String normalized = value == null ? "" : value.trim();
        return switch (normalized) {
            case "완료" -> COMPLETED;
            case "진행" -> IN_PROGRESS;
            case "취소" -> CANCELED;
            case "대기" -> PENDING;
            default -> throw new BusinessException(ErrorCode.MIG8_PROGRESS_STATUS_INVALID,
                    "주문 진행상태 unknown: '" + value + "'");
        };
    }
}
