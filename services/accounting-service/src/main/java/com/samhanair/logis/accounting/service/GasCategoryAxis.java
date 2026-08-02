package com.samhanair.logis.accounting.service;

import java.util.Locale;

/**
 * #991 일마감의 GAS 범위와 단가변동 schedule 키 사이의 정본 계약.
 *
 * <p>GAS는 판매전표 원본 행 순서를 따라 {@code currentZone}을
 * {@code HOME_MULTI}, {@code SINGLE}, {@code COMM_MULTI}로 전환한다. 구형은 별도 zone을
 * 여는 것이 아니라 구형 가격표를 우선 조회하므로, 표시 계약에서는 {@code OLD} 축으로
 * 명시한다.
 *
 * <p>이 enum은 상품 master의 {@code product_category}나 숫자형 이카운트 {@code product_code}를
 * 판매 라인의 카테고리로 추정하지 않는다. 판매 라인의 {@code model_name}에서 정규화한 GAS
 * 모델 토큰과 카테고리 입력을 연결하는 후속 축이 사용할 수 있도록, 알려진 값과 미상 값을
 * 분리한다.
 */
public enum GasCategoryAxis {
    HOME_MULTI("HOME_MULTI", "homemulti"),
    SINGLE("SINGLE", "singleSets"),
    COMM_MULTI("COMM_MULTI", "commercialMulti"),
    OLD("OLD", "oldProducts"),
    UNKNOWN("UNKNOWN", null);

    private final String gasZone;
    private final String scheduleKey;

    GasCategoryAxis(String gasZone, String scheduleKey) {
        this.gasZone = gasZone;
        this.scheduleKey = scheduleKey;
    }

    /**
     * GAS의 {@code currentZone}을 정식 축으로 변환한다.
     *
     * @param value GAS zone 문자열
     * @return 네 정식 축 중 하나 또는 {@link #UNKNOWN}
     */
    public static GasCategoryAxis fromGasZone(String value) {
        String normalized = normalize(value);
        for (GasCategoryAxis axis : values()) {
            if (axis != UNKNOWN && axis.gasZone.equalsIgnoreCase(normalized)) {
                return axis;
            }
        }
        return UNKNOWN;
    }

    /**
     * 기존 {@code price_change_schedule} 키를 정식 GAS 축으로 변환한다.
     *
     * <p>표시용 이름({@code HOME_MULTI})이나 임의의 주문 category key는 schedule 키가 아니므로
     * 허용하지 않는다. 키의 대소문자와 바깥 공백만 무해하게 정규화한다.
     *
     * @param value schedule 키
     * @return 네 정식 축 중 하나 또는 {@link #UNKNOWN}
     */
    public static GasCategoryAxis fromScheduleKey(String value) {
        String normalized = normalize(value);
        for (GasCategoryAxis axis : values()) {
            if (axis != UNKNOWN && axis.scheduleKey.equalsIgnoreCase(normalized)) {
                return axis;
            }
        }
        return UNKNOWN;
    }

    /** @return GAS 표현의 정식 zone 문자열 */
    public String gasZone() {
        return gasZone;
    }

    /** @return price_change_schedule의 정식 키. UNKNOWN은 null */
    public String scheduleKey() {
        return scheduleKey;
    }

    /** @return 정식 네 축인지 여부 */
    public boolean isKnown() {
        return this != UNKNOWN;
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
    }
}
