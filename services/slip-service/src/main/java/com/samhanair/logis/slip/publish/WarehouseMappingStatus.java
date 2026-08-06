package com.samhanair.logis.slip.publish;

/** eCount alias 탐지 결과. 일시 장애와 권위 원본의 미실재를 분리한다. */
public enum WarehouseMappingStatus {
    UNVERIFIED,
    VERIFIED,
    MISMATCH,
    NOT_FOUND,
    UNAVAILABLE,
    INVALID_CONFIGURATION,
    DEV_SUBSTITUTE
}
