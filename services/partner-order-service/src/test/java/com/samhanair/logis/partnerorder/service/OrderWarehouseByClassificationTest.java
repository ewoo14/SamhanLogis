package com.samhanair.logis.partnerorder.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * 주문서웹 확정 시 품목분류 기반 창고 판정 RED 계약.
 *
 * <p>fixture의 분류명은 2026-08-15 실측 대조 보고서에 기록된 실제 L/M 값만 사용한다.
 */
class OrderWarehouseByClassificationTest {

    @Test
    void homeInfiniteClassification_routesWholeOrderToSangil() {
        assertThat(decide(item("AR-CH01", "HOME_MULTI", "판넬", "인피니트")))
                .isEqualTo("2");
    }

    @Test
    void eachSingleLegacyCondition_routesToSangilByClassification() {
        List<OrderWarehouseByClassification.Item> cases = List.of(
                item("AC090CXAPBH1", "SINGLE_SET", "360", "CST UV"),
                item("AC072CXAPBH1", "SINGLE_SET", "4way 냉난방", "1등급"),
                item("AC060CS4DBC1SY", "SINGLE_SET", "4way 냉방전용", ""),
                item("AC072CXAPBH1", "SINGLE_SET", "1way 냉난방", "표준"),
                item("AC145BXADHH1", "SINGLE_SET", "덕트", "프리미엄/디럭스"),
                item("AF17B6474GZRS", "SINGLE_SET", "가정용 에어컨", "24년형"),
                item("AR06A9170HNQ", "SINGLE_SET", "냉난방 벽걸이", "기타"),
                item("AR60F06D1A0Q", "SINGLE_SET", "가정용 에어컨", "Q9000"));

        assertThat(cases).allSatisfy(it -> assertThat(decide(it)).isEqualTo("2"));
    }

    @Test
    void aSingleOrderHit_routesEveryOrderLineToSangil() {
        assertThat(decide(List.of(
                item("COMMERCIAL-NON-HIT", "COMMERCIAL_MULTI", "실외기", "표준형"),
                item("AF17B6474GZRS", "SINGLE_SET", "가정용 에어컨", "24년형"))))
                .isEqualTo("2");
    }

    @Test
    void noMatchingClassification_defaultsToChowol() {
        assertThat(decide(item("COMMERCIAL-NON-HIT", "COMMERCIAL_MULTI", "실외기", "표준형")))
                .isEqualTo("00003");
    }

    @Test
    void classifiedHomeMultiNonHit_isNotRecordedAsUnclassified() {
        OrderWarehouseByClassification.Decision decision = new OrderWarehouseByClassification().decide(
                List.of(item("AJ060MXHNBC1", "HOME_MULTI", "실외기", "단배관", true)));

        assertThat(decision.warehouseCode()).isEqualTo("00003");
        assertThat(decision.unclassifiedModels()).isEmpty();
    }

    @Test
    void classifiedHomeAccessoryNonHit_isNotRecordedAsUnclassified() {
        OrderWarehouseByClassification.Decision decision = new OrderWarehouseByClassification().decide(
                List.of(item("AWR-WE13N", "HOME_MULTI", "부자재", "리모컨", true)));

        assertThat(decision.warehouseCode()).isEqualTo("00003");
        assertThat(decision.unclassifiedModels()).isEmpty();
    }

    @Test
    void legacySangilException_overridesClassificationDefault() {
        OrderWarehouseByClassification.Decision decision = new OrderWarehouseByClassification().decide(
                List.of(item("AC060CXAPBH1", "SINGLE_SET", "냉난방 스탠드", "프레스티지")));

        assertThat(decision.warehouseCode()).isEqualTo("2");
        assertThat(decision.legacyExceptionModels()).containsExactly("AC060CXAPBH1");
    }

    @Test
    void legacyChowolException_overridesClassificationHit() {
        OrderWarehouseByClassification.Decision decision = new OrderWarehouseByClassification().decide(
                List.of(item("AC060CS6PBH1SY", "SINGLE_SET", "360", "CST UV")));

        assertThat(decision.warehouseCode()).isEqualTo("00003");
        assertThat(decision.legacyExceptionModels()).containsExactly("AC060CS6PBH1SY");
    }

    @Test
    void legacyExceptionSource_hasExactly27SangilAnd5ChowolModels() {
        assertThat(LegacyWarehouseExceptions.all()).hasSize(32);
        assertThat(LegacyWarehouseExceptions.all().stream()
                .filter(exception -> "2".equals(exception.warehouseCode())).count()).isEqualTo(27);
        assertThat(LegacyWarehouseExceptions.all().stream()
                .filter(exception -> "00003".equals(exception.warehouseCode())).count()).isEqualTo(5);
    }

    @Test
    void missingClassification_defaultsButReturnsVisibleWarning() {
        OrderWarehouseByClassification.Decision decision = new OrderWarehouseByClassification().decide(
                List.of(item("UNKNOWN-CLASSIFICATION", "SINGLE_SET", null, null)));

        assertThat(decision.warehouseCode()).isEqualTo("00003");
        assertThat(decision.unclassifiedModels()).containsExactly("UNKNOWN-CLASSIFICATION");
    }

    @Test
    void unknownClassification_defaultsButReturnsVisibleWarning() {
        OrderWarehouseByClassification.Decision decision = new OrderWarehouseByClassification().decide(
                List.of(item("UNKNOWN-CLASSIFICATION", "SINGLE_SET", "신규분류", "미지", false)));

        assertThat(decision.warehouseCode()).isEqualTo("00003");
        assertThat(decision.unclassifiedModels()).containsExactly("UNKNOWN-CLASSIFICATION");
    }

    private static String decide(OrderWarehouseByClassification.Item item) {
        return decide(List.of(item));
    }

    private static String decide(List<OrderWarehouseByClassification.Item> items) {
        return new OrderWarehouseByClassification().decide(items).warehouseCode();
    }

    private static OrderWarehouseByClassification.Item item(
            String modelCode, String productCategory, String catL, String catM) {
        return new OrderWarehouseByClassification.Item(modelCode, productCategory, catL, catM);
    }

    private static OrderWarehouseByClassification.Item item(
            String modelCode, String productCategory, String catL, String catM,
            boolean classificationAssigned) {
        return new OrderWarehouseByClassification.Item(
                modelCode, productCategory, catL, catM, classificationAssigned);
    }
}
