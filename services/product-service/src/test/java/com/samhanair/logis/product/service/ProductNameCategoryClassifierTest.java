package com.samhanair.logis.product.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.product.domain.BundleComponent.ComponentKind;
import java.util.Set;
import java.util.stream.Stream;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/** 품목명 제품구분 보수 규칙의 우선순위 회귀를 고정한다. */
class ProductNameCategoryClassifierTest {

    @ParameterizedTest(name = "{0} → {1}")
    @MethodSource("classificationCases")
    void classify_보수규칙_우선순위대로_카테고리코드를_반환한다(String productName, String expectedCode) {
        assertThat(ProductNameCategoryClassifier.classify(productName)).isEqualTo(expectedCode);
    }

    private static Stream<Arguments> classificationCases() {
        return Stream.of(
                Arguments.of("설치비", "SERVICE"),
                Arguments.of("벽걸이 리모컨", "CONTROL"),
                Arguments.of("실외기 받침대", "PIPING"),
                Arguments.of("실외기 필터", "OUTDOOR"),
                Arguments.of("실외기", "OUTDOOR"),
                Arguments.of("전열 교환기", "HVAC"),
                Arguments.of("벽걸이 실내기", "INDOOR"),
                Arguments.of("4-Way 실내기", "INDOOR"),
                Arguments.of("일반 실내기", "INDOOR"),
                Arguments.of("AM180NXVUHH1", "UNREGISTERED"),
                Arguments.of(null, "UNREGISTERED")
        );
    }

    @ParameterizedTest(name = "{0} + {1} → {2}")
    @MethodSource("componentSignalCases")
    void classify_품목명우선후_구성품역산을_보조신호로_적용한다(
            String productName, Set<ComponentKind> componentKinds, String expectedCode) {
        assertThat(ProductNameCategoryClassifier.classify(productName, componentKinds)).isEqualTo(expectedCode);
    }

    private static Stream<Arguments> componentSignalCases() {
        return Stream.of(
                Arguments.of("이름 미상", Set.of(ComponentKind.OUTDOOR), "OUTDOOR"),
                Arguments.of("이름 미상", Set.of(ComponentKind.REMOTE), "CONTROL"),
                Arguments.of("이름 미상", Set.of(ComponentKind.ACCESSORY), "PIPING"),
                Arguments.of("무풍 1way 냉방전용 실내기", Set.of(ComponentKind.ACCESSORY, ComponentKind.INDOOR), "INDOOR"),
                Arguments.of("실외기", Set.of(ComponentKind.ACCESSORY), "OUTDOOR")
        );
    }
}
