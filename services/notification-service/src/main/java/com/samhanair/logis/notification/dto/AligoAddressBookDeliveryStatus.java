package com.samhanair.logis.notification.dto;

/**
 * 알리고 주소록 contact 가 외부 시스템에 실제 전달되었는지 나타내는 상태.
 *
 * <p>주소록 API client 가 실 구현체로 교체되어도 sync 응답은 이 상태를 통해
 * 건수의 의미를 보존한다. {@link #NOT_DELIVERED} 는 성공/신규 등록 건수로
 * 해석할 수 없다.
 */
public enum AligoAddressBookDeliveryStatus {

    /** 외부 알리고 시스템으로 전달되지 않음 (mock, 재시도 소진, 전송 실패 포함). */
    NOT_DELIVERED,

    /** 일부 chunk 만 외부 전달됨. */
    PARTIALLY_DELIVERED,

    /** 모든 처리 대상 chunk 가 외부 전달됨. */
    DELIVERED;

    /** 두 chunk 상태를 전체 동기화 상태로 합친다. */
    public static AligoAddressBookDeliveryStatus combine(
            AligoAddressBookDeliveryStatus current,
            AligoAddressBookDeliveryStatus next) {
        if (current == null) {
            return next;
        }
        if (next == null || current == next) {
            return current;
        }
        return PARTIALLY_DELIVERED;
    }
}
