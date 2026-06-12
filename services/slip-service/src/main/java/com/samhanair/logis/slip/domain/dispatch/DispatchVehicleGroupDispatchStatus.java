package com.samhanair.logis.slip.domain.dispatch;

/**
 * 차량 그룹 단위 arologis 발송 상태.
 *
 * <p>task 전체 상태와 분리해 선택 전송 후 미선택 그룹이 다시 발송될 수 있게 한다.
 */
public enum DispatchVehicleGroupDispatchStatus {
    /** 아직 arologis 로 발송하지 않은 차량 그룹. */
    PENDING,
    /** arologis 발송 요청이 완료된 차량 그룹. */
    DISPATCHED
}
