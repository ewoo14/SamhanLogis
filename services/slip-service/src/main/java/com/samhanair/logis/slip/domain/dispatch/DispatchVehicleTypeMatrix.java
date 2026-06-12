package com.samhanair.logis.slip.domain.dispatch;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * 배차 2축 차량 모델 설정.
 *
 * <p>개발책임자가 차종별 허용 톤수 부분집합을 쉽게 조정할 수 있도록 단일 static map 으로 둔다.
 * 빈 목록은 해당 차종이 톤수 선택을 요구하지 않는다는 의미다.
 */
public final class DispatchVehicleTypeMatrix {

    private static final List<DispatchTonnage> ACTIVE_TONNAGES = DispatchTonnage.activeValues();

    /** 차종별 허용 톤수. 빈 목록이면 tonnage null 허용/불요. */
    public static final Map<DispatchVehicleBodyType, List<DispatchTonnage>> ALLOWED_TONNAGES =
            buildAllowedTonnages();

    private DispatchVehicleTypeMatrix() {}

    /** 차종별 허용 톤수 목록. */
    public static List<DispatchTonnage> allowedTonnages(DispatchVehicleBodyType bodyType) {
        Objects.requireNonNull(bodyType, "bodyType 필수");
        List<DispatchTonnage> allowed = ALLOWED_TONNAGES.get(bodyType);
        if (allowed == null) {
            throw new IllegalArgumentException("선택할 수 없는 차종: " + bodyType);
        }
        return allowed;
    }

    /** 해당 차종이 톤수 입력을 요구하는지 여부. */
    public static boolean requiresTonnage(DispatchVehicleBodyType bodyType) {
        return !allowedTonnages(bodyType).isEmpty();
    }

    /** 차종/톤수 조합 검증. */
    public static void validate(DispatchVehicleBodyType bodyType, DispatchTonnage tonnage) {
        Objects.requireNonNull(bodyType, "bodyType 필수");
        if (!bodyType.isActive()) {
            throw new IllegalArgumentException("선택할 수 없는 차종: " + bodyType);
        }
        if (tonnage != null && !tonnage.isActive()) {
            throw new IllegalArgumentException("선택할 수 없는 톤수: " + tonnage);
        }
        List<DispatchTonnage> allowed = allowedTonnages(bodyType);
        if (allowed.isEmpty()) {
            if (tonnage != null) {
                throw new IllegalArgumentException("소형 차종은 tonnage 불필요: " + bodyType);
            }
            return;
        }
        if (tonnage == null) {
            throw new IllegalArgumentException("해당 차종은 tonnage 필수: " + bodyType);
        }
        if (!allowed.contains(tonnage)) {
            throw new IllegalArgumentException("허용되지 않은 차종/톤수 조합: " + bodyType + "/" + tonnage);
        }
    }

    private static Map<DispatchVehicleBodyType, List<DispatchTonnage>> buildAllowedTonnages() {
        EnumMap<DispatchVehicleBodyType, List<DispatchTonnage>> map =
                new EnumMap<>(DispatchVehicleBodyType.class);
        map.put(DispatchVehicleBodyType.MOTORCYCLE, List.of());
        map.put(DispatchVehicleBodyType.DAMAS, List.of());
        map.put(DispatchVehicleBodyType.LABO, List.of());
        map.put(DispatchVehicleBodyType.CARGO, ACTIVE_TONNAGES);
        map.put(DispatchVehicleBodyType.WINGBODY, ACTIVE_TONNAGES);
        map.put(DispatchVehicleBodyType.TOPCAR, ACTIVE_TONNAGES);
        map.put(DispatchVehicleBodyType.LIFT, ACTIVE_TONNAGES);
        map.put(DispatchVehicleBodyType.REEFER, ACTIVE_TONNAGES);
        map.put(DispatchVehicleBodyType.VIBRATION_FREE, ACTIVE_TONNAGES);
        return Map.copyOf(map);
    }
}
