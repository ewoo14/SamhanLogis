package com.samhanair.logis.slip.domain.dispatch;

/**
 * 차량 그룹 단위 arologis 발송 상태.
 *
 * <p>task 전체 상태와 분리해 선택 전송 후 미선택 그룹이 다시 발송될 수 있게 한다.
 */
public enum DispatchVehicleGroupDispatchStatus {
    /** 아직 arologis 로 발송하지 않은 차량 그룹. */
    PENDING("미발송"),
    /** arologis 발송 요청이 완료된 차량 그룹. */
    DISPATCHED("발송완료");

    private final String displayName;

    DispatchVehicleGroupDispatchStatus(String displayName) {
        this.displayName = displayName;
    }

    /**
     * 사용자 노출 메시지/배지에 사용하는 한국어 상태 라벨.
     *
     * <p>desktop {@code DISPATCH_VEHICLE_GROUP_DISPATCH_STATUS_LABEL}
     * (clients/desktop/src/renderer/api/dispatchTask.ts) 과 동일한 문구를 SSOT 로 사용한다
     * (#725 — IllegalState 상태전이 메시지 sweep).
     *
     * @return 한국어 상태 표시명
     */
    public String getDisplayName() {
        return displayName;
    }
}
