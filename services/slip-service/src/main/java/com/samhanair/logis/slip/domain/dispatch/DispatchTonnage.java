package com.samhanair.logis.slip.domain.dispatch;

/**
 * 배차 차량 톤수 축.
 *
 * <p>소형 차종은 톤수 선택이 불필요하므로 {@code null} 로 저장하고, 화물 차종은 본 enum 값 중
 * {@link DispatchVehicleTypeMatrix} 가 허용한 값만 저장한다.
 */
public enum DispatchTonnage {
    /** 1톤 */
    T_1("1톤"),
    /** 1.2톤 */
    T_1_2("1.2톤"),
    /** 1.4톤 */
    T_1_4("1.4톤"),
    /** 2.5톤 */
    T_2_5("2.5톤"),
    /** 3.5톤 */
    T_3_5("3.5톤"),
    /** 5톤 */
    T_5("5톤"),
    /** 11톤 */
    T_11("11톤"),
    /** 14톤 */
    T_14("14톤"),
    /** 18톤 */
    T_18("18톤"),
    /** 25톤 */
    T_25("25톤");

    private final String displayName;

    DispatchTonnage(String displayName) {
        this.displayName = displayName;
    }

    /** 사용자 노출용 한국어 라벨. */
    public String getDisplayName() {
        return displayName;
    }
}
