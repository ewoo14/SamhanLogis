package com.samhanair.logis.inventory.service;

/**
 * 입고 전표의 QR 수명주기 판정.
 *
 * <p>slip-service의 DeliveryTag enum 이름을 서비스 간 안정 키로 전달한다.
 * 태그가 없는 INBOUND는 slip-service가 PURCHASE로 정규화한다. 표시 라벨은 계약에 포함하지 않는다.
 */
final class InboundQrLifecycle {
    static final String PURCHASE = "PURCHASE";
    static final String BORROW = "BORROW";
    static final String RENTAL_RETURN = "RENTAL_RETURN";

    private InboundQrLifecycle() {
    }

    static boolean allowsNewQr(String inboundType) {
        return PURCHASE.equals(inboundType)
                || BORROW.equals(inboundType)
                || RENTAL_RETURN.equals(inboundType);
    }
}
