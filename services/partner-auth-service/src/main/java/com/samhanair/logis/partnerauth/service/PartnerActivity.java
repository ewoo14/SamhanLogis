package com.samhanair.logis.partnerauth.service;

import java.time.LocalDateTime;

/** 주문·출고 서비스가 제공하는 거래처별 최근 활동 시각 묶음. */
public record PartnerActivity(
        LocalDateTime lastOrderAt,
        LocalDateTime lastShipmentAt,
        boolean orderLookupSucceeded,
        boolean shipmentLookupSucceeded) {

    /** 기존 단위 테스트·호출부의 정상 조회 snapshot 생성자. */
    public PartnerActivity(LocalDateTime lastOrderAt, LocalDateTime lastShipmentAt) {
        this(lastOrderAt, lastShipmentAt, true, true);
    }

    /** 주문·출고 중 하나라도 조회할 수 없는 장애 snapshot. */
    public static PartnerActivity unavailable() {
        return new PartnerActivity(null, null, false, false);
    }

    /** 두 원천을 모두 읽었을 때만 활동 없음도 확정할 수 있다. */
    public boolean isLookupComplete() {
        return orderLookupSucceeded && shipmentLookupSucceeded;
    }

    /** 두 업무 시각 중 더 최근 시각을 반환한다. */
    public LocalDateTime lastActivityAt() {
        if (lastOrderAt == null) return lastShipmentAt;
        if (lastShipmentAt == null) return lastOrderAt;
        return lastOrderAt.isAfter(lastShipmentAt) ? lastOrderAt : lastShipmentAt;
    }
}
