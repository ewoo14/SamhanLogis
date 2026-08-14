package com.samhanair.logis.slip.domain;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 배송 태그. 각 태그는 적용 가능한 전표 종류({@link #direction})를 제한한다.
 * 지방(REGION)/야적(STACK) 태그({@link #autoMemo}=true) 는 V52 배송일정 구조화 대상 —
 * {@code Slip.applyDeliverySchedule()} 로 하차일(N) 자동 계산.
 *
 * <p>{@link #getKoreanLabel()} 은 FE 표시용 한국어 라벨을 반환하며, {@link #displayName} 과 동일.
 * {@link #direction} 은 slipType 정합 가드 ({@code SlipService.list()}) 에서 사용된다.
 */
@Getter
@RequiredArgsConstructor
public enum DeliveryTag {
    SALE("판매", SlipType.OUTBOUND, false),
    STACK("야적", SlipType.OUTBOUND, true),
    REGION("지방", SlipType.OUTBOUND, true),
    LOGEN("로젠택배", SlipType.OUTBOUND, false),
    GYEONGDONG_PARCEL("경동택배", SlipType.OUTBOUND, false),
    GYEONGDONG_FREIGHT("경동화물", SlipType.OUTBOUND, false),
    DEFECT_RETURN("불량반납", SlipType.OUTBOUND, false),
    DIRECT_DELIVERY("직배", SlipType.OUTBOUND, false),
    PREEMPTIVE_ACTION("착하선조치", SlipType.OUTBOUND, false),
    PURCHASE("구매", SlipType.INBOUND, false),
    RETURN_TRIP("회차", SlipType.INBOUND, false),
    RETURN("반품", SlipType.INBOUND, false),
    BORROW("차용", SlipType.INBOUND, false),
    RENTAL("대여", SlipType.OUTBOUND, false),
    BORROW_RETURN("차용반납", SlipType.OUTBOUND, false),
    RENTAL_RETURN("대여반납", SlipType.INBOUND, false),
    DELIVERY_RETURN("착하반품", SlipType.INBOUND, false),
    REENTRY("재입고", SlipType.INBOUND, false);

    private final String displayName;
    private final SlipType direction;
    private final boolean autoMemo;

    /**
     * FE 표시용 한국어 라벨을 반환한다.
     *
     * <p>SALE→"판매" / STACK→"야적" / REGION→"지방" / LOGEN→"로젠택배" /
     * GYEONGDONG_PARCEL→"경동택배" / GYEONGDONG_FREIGHT→"경동화물" /
     * RENTAL→"대여" / BORROW_RETURN→"차용반납" (출고 전용) +
     * RETURN_TRIP→"회차" / RETURN→"반품" / BORROW→"차용" /
     * RENTAL_RETURN→"대여반납" / DELIVERY_RETURN→"착하반품" / REENTRY→"재입고"
     * (입고 전용).
     *
     * @return 한국어 라벨 ({@link #displayName} 과 동일)
     */
    public String getKoreanLabel() {
        return displayName;
    }
}
