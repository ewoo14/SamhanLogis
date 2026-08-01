package com.samhanair.logis.slip.publish;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/** 외부 창고 조회 없이 설정값 자체만으로 기동 검증하는지 확인한다. */
class WarehouseCodeMapperStartupValidationTest {

    @Test
    void 미치환_placeholder는_UUID를_노출하지_않고_기동_실패한다() {
        assertStartupFailure("${WAREHOUSE_UUID_HQ}");
    }

    @ParameterizedTest
    @MethodSource("invalidValues")
    void UUID가_아닌_값과_빈_값과_공백은_UUID를_노출하지_않고_기동_실패한다(String value) {
        assertStartupFailure(value);
    }

    @Test
    void 형식이_맞는_UUID는_실재하지_않아도_외부_호출_없이_기동한다() {
        WarehouseCodeMapper mapper = mapperWith("00003", "00000000-0000-0000-0000-000000000099");

        assertThatCode(mapper::logEffectiveMap).doesNotThrowAnyException();
    }

    @Test
    void 창고_client를_주입하지_않아도_정상_매핑은_기동한다() {
        WarehouseCodeMapper mapper = mapperWith("00003", "00000000-0000-0000-0000-000000000001");

        assertThatCode(mapper::logEffectiveMap).doesNotThrowAnyException();
    }

    private static Stream<Arguments> invalidValues() {
        return Stream.of(
                Arguments.of("not-a-uuid"),
                Arguments.of(""),
                Arguments.of("   "));
    }

    private static void assertStartupFailure(String value) {
        WarehouseCodeMapper mapper = mapperWith("00003", value);

        assertThatThrownBy(mapper::logEffectiveMap)
                .hasMessageContaining("00003")
                .hasMessageNotContaining("00000000-0000-0000-0000-000000000099");
    }

    private static WarehouseCodeMapper mapperWith(String code, String value) {
        WarehouseCodeMapper mapper = new WarehouseCodeMapper();
        mapper.setWarehouseCodeMap(Map.of(code, value));
        return mapper;
    }
}
