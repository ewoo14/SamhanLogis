package com.samhanair.logis.slip.domain.dispatch;

/**
 * 배차 차량 종류 — Samhan Public 배차 메뉴 (Phase A, D-DB-03).
 *
 * <p>9 active 값 — UI 노출용. arologis {@code VehicleTonnage} 와 매칭되며 (legacy 2 값 미포함)
 * service-to-service 통신 시 enum name 으로 전송 → arologis 측에서 {@code VehicleTonnage.valueOf()} 로 복원.
 *
 * <p>도메인 결정: D-DB-03 (spec § 2 참조). arologis VehicleTonnage 의 legacy 2 (TONNAGE_1_4, TONNAGE_BIG)
 * 는 카톡 파싱 backward compat 용으로 보존되며 본 enum 에서는 제외.
 */
public enum DispatchVehicleType {
    /** 오토바이 */
    MOTORCYCLE("오토바이"),
    /** 다마스 */
    DAMAS("다마스"),
    /** 1톤 */
    TONNAGE_1("1톤"),
    /** 1.5톤 */
    TONNAGE_1_5("1.5톤"),
    /** 2.5톤 */
    TONNAGE_2_5("2.5톤"),
    /** 3톤 */
    TONNAGE_3("3톤"),
    /** 5톤 */
    TONNAGE_5("5톤"),
    /** 10톤 */
    TONNAGE_10("10톤"),
    /** 20톤 */
    TONNAGE_20("20톤");

    private final String displayName;

    DispatchVehicleType(String displayName) {
        this.displayName = displayName;
    }

    /** 사용자 노출용 한국어 라벨. */
    public String getDisplayName() {
        return displayName;
    }
}
