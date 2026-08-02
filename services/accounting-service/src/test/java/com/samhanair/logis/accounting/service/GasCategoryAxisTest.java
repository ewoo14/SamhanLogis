package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * #991 슬1 — GAS currentZone과 price_change_schedule 키의 분류 계약.
 *
 * <p>이 테스트는 판매 라인의 카테고리를 상품 master나 product_code로 추정하지 않는다.
 * 실제 라인 축이 연결되는 슬2·슬3에서 이 계약을 소비하기 전, 정상 키와 UNKNOWN을 먼저 고정한다.
 */
class GasCategoryAxisTest {

    @Test
    void gasZones_mapToTheCanonicalScheduleKeys() {
        assertThat(GasCategoryAxis.fromGasZone("HOME_MULTI").scheduleKey())
                .isEqualTo("homemulti");
        assertThat(GasCategoryAxis.fromGasZone("SINGLE").scheduleKey())
                .isEqualTo("singleSets");
        assertThat(GasCategoryAxis.fromGasZone("COMM_MULTI").scheduleKey())
                .isEqualTo("commercialMulti");
        assertThat(GasCategoryAxis.fromGasZone("OLD").scheduleKey())
                .isEqualTo("oldProducts");
    }

    @Test
    void scheduleKeys_roundTripToTheSameGasAxis() {
        assertThat(GasCategoryAxis.fromScheduleKey("homemulti"))
                .isEqualTo(GasCategoryAxis.HOME_MULTI);
        assertThat(GasCategoryAxis.fromScheduleKey("singleSets"))
                .isEqualTo(GasCategoryAxis.SINGLE);
        assertThat(GasCategoryAxis.fromScheduleKey("commercialMulti"))
                .isEqualTo(GasCategoryAxis.COMM_MULTI);
        assertThat(GasCategoryAxis.fromScheduleKey("oldProducts"))
                .isEqualTo(GasCategoryAxis.OLD);
    }

    @Test
    void blank_unknown_and_nonCanonicalValues_neverBecomeAKnownAxis() {
        assertThat(GasCategoryAxis.fromGasZone(null)).isEqualTo(GasCategoryAxis.UNKNOWN);
        assertThat(GasCategoryAxis.fromGasZone("UNKNOWN")).isEqualTo(GasCategoryAxis.UNKNOWN);
        assertThat(GasCategoryAxis.fromGasZone("AIR_CONDITIONER")).isEqualTo(GasCategoryAxis.UNKNOWN);
        assertThat(GasCategoryAxis.fromScheduleKey(null)).isEqualTo(GasCategoryAxis.UNKNOWN);
        assertThat(GasCategoryAxis.fromScheduleKey("HOME_MULTI")).isEqualTo(GasCategoryAxis.UNKNOWN);
        assertThat(GasCategoryAxis.fromScheduleKey("product_code")).isEqualTo(GasCategoryAxis.UNKNOWN);
    }

    @Test
    void numericEcountProductCode_isNotAGasModelTokenOrCategory() {
        assertThat(ModelTokenExtractor.extractModelTokenOrNull("010001")).isNull();
        assertThat(GasCategoryAxis.fromGasZone("010001")).isEqualTo(GasCategoryAxis.UNKNOWN);
    }

    @Test
    void knownValues_areWhitespaceAndCaseTolerant_butRemainExactAfterNormalization() {
        assertThat(GasCategoryAxis.fromGasZone("  comm_multi ")).isEqualTo(GasCategoryAxis.COMM_MULTI);
        assertThat(GasCategoryAxis.fromScheduleKey(" SINGLESETS ")).isEqualTo(GasCategoryAxis.SINGLE);
        assertThat(GasCategoryAxis.UNKNOWN.scheduleKey()).isNull();
    }
}
