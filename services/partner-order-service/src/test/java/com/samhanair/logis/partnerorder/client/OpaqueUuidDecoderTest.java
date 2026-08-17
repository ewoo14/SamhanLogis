package com.samhanair.logis.partnerorder.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;
import org.junit.jupiter.api.Test;

class OpaqueUuidDecoderTest {

    private static final UUID PRODUCT_ID = UUID.fromString("123e4567-e89b-12d3-a456-426655443322");
    // product-service OpaqueUuidSerializer.encode(PRODUCT_ID)의 실제 발급 형식 샘플.
    private static final String PRODUCT_OPAQUE_TOKEN = "Ej5FZ-ibEtOkVkJmVUQzIg";

    @Test
    void 경계_입력은_규약대로_처리한다() {
        assertThat(OpaqueUuidDecoder.decode(null)).isNull();
        assertThat(OpaqueUuidDecoder.decode("")).isNull();
        assertThat(OpaqueUuidDecoder.decode("   ")).isNull();
        assertInvalid("abc");
        assertInvalid("123456789012345678901");
        assertInvalid("1234567890123456789012");
        assertThat(OpaqueUuidDecoder.decode(PRODUCT_OPAQUE_TOKEN)).isEqualTo(PRODUCT_ID);
        assertThat(OpaqueUuidDecoder.decode(PRODUCT_ID.toString())).isEqualTo(PRODUCT_ID);
        assertInvalid("Ej5FZ-ibEtOkJmVUQzI!");
    }

    @Test
    void 숫자만_있는_22자리는_UUID로_조용히_변환하지_않는다() {
        String invalid = "1234567890123456789012";

        assertThatThrownBy(() -> OpaqueUuidDecoder.decode(invalid))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("유효하지 않은 제품 식별자입니다.")
                .hasMessageNotContaining(invalid);
    }

    private static void assertInvalid(String value) {
        assertThatThrownBy(() -> OpaqueUuidDecoder.decode(value))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("유효하지 않은 제품 식별자입니다.")
                .hasMessageNotContaining(value);
    }
}
