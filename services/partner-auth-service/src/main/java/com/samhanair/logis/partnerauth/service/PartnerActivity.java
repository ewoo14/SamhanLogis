package com.samhanair.logis.partnerauth.service;

import java.time.LocalDateTime;

/** 주문·출고 서비스가 제공하는 거래처별 최근 활동 시각 묶음. */
public record PartnerActivity(LocalDateTime lastOrderAt, LocalDateTime lastShipmentAt) {

    /** 두 업무 시각 중 더 최근 시각을 반환한다. */
    public LocalDateTime lastActivityAt() {
        if (lastOrderAt == null) return lastShipmentAt;
        if (lastShipmentAt == null) return lastOrderAt;
        return lastOrderAt.isAfter(lastShipmentAt) ? lastOrderAt : lastShipmentAt;
    }
}
