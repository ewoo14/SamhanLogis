package com.samhanair.logis.arologis.domain;

/**
 * 차량 톤수 — Phase 10 W10-1 + Samhan Public 배차 메뉴 Phase A 확장 (D-DB-03).
 *
 * <p>현재 active 9 값 (Samhan Public 배차 메뉴 UI 노출). legacy 2 값은 DB/구버전 payload backward compat
 * 상수로만 유지하고, 신규 카톡 파싱 입력은 active 값으로 보정한다.
 *
 * <h2>Active 9 (UI 노출)</h2>
 * <ul>
 *   <li>{@link #MOTORCYCLE} — 오토바이 (NEW Phase A)</li>
 *   <li>{@link #DAMAS} — 다마스 (NEW Phase A)</li>
 *   <li>{@link #TONNAGE_1} — 1톤</li>
 *   <li>{@link #TONNAGE_1_5} — 1.5톤 (NEW Phase A)</li>
 *   <li>{@link #TONNAGE_2_5} — 2.5톤</li>
 *   <li>{@link #TONNAGE_3} — 3톤 (NEW Phase A)</li>
 *   <li>{@link #TONNAGE_5} — 5톤</li>
 *   <li>{@link #TONNAGE_10} — 10톤 (NEW Phase A)</li>
 *   <li>{@link #TONNAGE_20} — 20톤 (NEW Phase A)</li>
 * </ul>
 *
 * <h2>Legacy 2 (deprecated, 저장 데이터 호환)</h2>
 * <ul>
 *   <li>{@link #TONNAGE_1_4} — 1.4톤 (사용자 제공 13 차량 중 1 차량 해당). UI 노출 X.</li>
 *   <li>{@link #TONNAGE_BIG} — 11톤 / 25톤 등 대형. UI 노출 X — Phase A 부터 TONNAGE_10/20 명시.</li>
 * </ul>
 */
public enum VehicleTonnage {
    MOTORCYCLE,
    DAMAS,
    TONNAGE_1,
    /** @deprecated 카톡 파싱 backward compat. UI 노출 금지. Phase A 부터 입력 시 TONNAGE_1 로 보강 권장. */
    @Deprecated
    TONNAGE_1_4,
    TONNAGE_1_5,
    TONNAGE_2_5,
    TONNAGE_3,
    TONNAGE_5,
    TONNAGE_10,
    TONNAGE_20,
    /** @deprecated 카톡 파싱 backward compat. UI 노출 금지. Phase A 부터 입력 시 TONNAGE_10/20 명시. */
    @Deprecated
    TONNAGE_BIG;

    /**
     * "1" / "1.4" / "1.5" / "2.5" / "3" / "5" / "10" / "20" / "11" / "25" / "오토바이" / "다마스"
     * raw 톤수 문자열 → active enum.
     * 미해석 시 {@link #TONNAGE_1} 으로 fallback (skeleton 단계 — 수동 보정 의무).
     */
    public static VehicleTonnage fromRaw(String raw) {
        if (raw == null) {
            return TONNAGE_1;
        }
        String trimmed = raw.trim();
        return switch (trimmed) {
            case "오토바이", "motorcycle", "MOTORCYCLE" -> MOTORCYCLE;
            case "다마스", "damas", "DAMAS" -> DAMAS;
            case "1", "1.4" -> TONNAGE_1;
            case "1.5" -> TONNAGE_1_5;
            case "2.5" -> TONNAGE_2_5;
            case "3" -> TONNAGE_3;
            case "5" -> TONNAGE_5;
            case "10", "11" -> TONNAGE_10;
            case "20", "25" -> TONNAGE_20;
            default -> TONNAGE_1;
        };
    }
}
