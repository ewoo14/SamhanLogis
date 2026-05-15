package com.samhanair.logis.arologis.web.dto.photo;

/**
 * 아로로지스 기사앱 정차 사진 유형.
 *
 * <p>D-AX-17 driver-facing path variable 에서 허용하는 값만 정의한다. 견적 사진(ESTIMATE)은
 * 기사앱 정차 증빙 범위가 아니므로 본 enum 에 포함하지 않는다.
 */
public enum DriverPhotoType {
    /** 배송 증빙 사진. */
    DELIVERY,
    /** 검수 증빙 사진. */
    INSPECTION
}
