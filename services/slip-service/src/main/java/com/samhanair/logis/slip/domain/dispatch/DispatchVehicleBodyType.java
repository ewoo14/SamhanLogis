package com.samhanair.logis.slip.domain.dispatch;

import java.util.List;
import java.util.Set;

/**
 * 배차 차량 차종 축.
 *
 * <p>차종은 사용자 선택의 1차 축이며, 톤수 축은 {@link DispatchVehicleTypeMatrix} 가 허용하는
 * 차종에서만 선택한다.
 */
public enum DispatchVehicleBodyType {
    /** 오토바이 */
    MOTORCYCLE("오토바이"),
    /** 승용차 */
    SEDAN("승용차"),
    /** 다마스 */
    DAMAS("다마스"),
    /** 라보 */
    LABO("라보"),
    /** 카고 */
    CARGO("카고"),
    /** 윙바디 */
    WINGBODY("윙바디"),
    /** 탑차 */
    TOPCAR("탑차"),
    /** 리프트 */
    LIFT("리프트"),
    /** 냉장냉동탑 */
    REEFER("냉장냉동탑"),
    /** 무진동 */
    VIBRATION_FREE("무진동"),
    /** 축차 */
    AXLE("축차"),
    /** 추레라 */
    TRAILER("추레라");

    private static final List<DispatchVehicleBodyType> ACTIVE = List.of(
            MOTORCYCLE,
            DAMAS,
            LABO,
            CARGO,
            WINGBODY,
            TOPCAR,
            LIFT,
            REEFER,
            VIBRATION_FREE);

    private static final Set<DispatchVehicleBodyType> ACTIVE_SET = Set.copyOf(ACTIVE);

    private final String displayName;

    DispatchVehicleBodyType(String displayName) {
        this.displayName = displayName;
    }

    /** 사용자 노출용 한국어 라벨. */
    public String getDisplayName() {
        return displayName;
    }

    /** 배차 화면에서 현재 선택 가능한 차종인지 여부. */
    public boolean isActive() {
        return ACTIVE_SET.contains(this);
    }

    /** 배차 화면 선택지에 노출할 active 차종 목록. */
    public static List<DispatchVehicleBodyType> activeValues() {
        return ACTIVE;
    }
}
