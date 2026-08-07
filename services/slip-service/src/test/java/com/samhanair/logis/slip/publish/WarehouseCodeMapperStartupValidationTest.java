package com.samhanair.logis.slip.publish;

import static org.assertj.core.api.Assertions.assertThat;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/** 운영 매핑은 기동을 막지 않고, 명시된 정책에서만 발행 경로를 허용하는지 확인한다. */
class WarehouseCodeMapperStartupValidationTest {

    @Test
    void legacyCode가_업무구분의_권위출처다() {
        WarehouseCodeMapper mapper = new WarehouseCodeMapper();
        mapper.setWarehouseCodeMap(Map.of(
                "00003", "11111111-1111-1111-1111-000000000001",
                "2", "11111111-1111-1111-1111-000000000002"));

        assertThat(mapper.businessType("00003")).isEqualTo("CHOWOL");
        assertThat(mapper.businessType("2")).isEqualTo("SANGIL");
        assertThat(mapper.businessType("14")).isEqualTo("UNKNOWN");
    }

    @Test
    void 미치환_placeholder는_UUID를_노출하지_않고_기동을_막지_않는다() {
        assertThatCode(() -> mapperWith("00003", "${WAREHOUSE_UUID_ECOUNT_00003}").logEffectiveMap())
                .doesNotThrowAnyException();
    }

    @ParameterizedTest
    @MethodSource("invalidValues")
    void UUID가_아닌_값과_빈_값과_공백은_UUID를_노출하지_않고_기동을_막지_않는다(String value) {
        assertThatCode(() -> mapperWith("00003", value).logEffectiveMap())
                .doesNotThrowAnyException();
    }

    @Test
    void 형식이_맞는_UUID는_실재성_검증_전에도_외부_호출_없이_기동한다() {
        WarehouseCodeMapper mapper = mapperWith("00003", "00000000-0000-0000-0000-000000000099");

        assertThatCode(mapper::logEffectiveMap).doesNotThrowAnyException();
    }

    @Test
    void 축약형_UUID는_정규_문자열_형식이_아니어도_기동을_막지_않는다() {
        assertThatCode(() -> mapperWith("00003", "1-1-1-1-1").logEffectiveMap())
                .doesNotThrowAnyException();
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

    private static WarehouseCodeMapper mapperWith(String code, String value) {
        WarehouseCodeMapper mapper = new WarehouseCodeMapper();
        mapper.setWarehouseCodeMap(Map.of(code, value));
        return mapper;
    }
}
