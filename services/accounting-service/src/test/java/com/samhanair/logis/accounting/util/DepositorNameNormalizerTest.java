package com.samhanair.logis.accounting.util;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** 입금자명 정규화기의 보수적 Unicode 공백 정책 단위 테스트. */
class DepositorNameNormalizerTest {

    @Test
    @DisplayName("앞뒤와 내부의 Unicode 공백을 한 칸으로 축약하고 대문자화한다")
    void normalizesUnicodeWhitespaceAndCase() {
        String raw = "\u00A0  Han\t\u2003 River\n\u3000 Co  ";

        assertThat(DepositorNameNormalizer.normalize(raw)).isEqualTo("HAN RIVER CO");
    }

    @Test
    @DisplayName("괄호와 특수문자와 전각 문자는 제거하지 않는다")
    void preservesMeaningfulCharacters() {
        String raw = "  (주) ＡＢＣ·Co.,Ltd  ";

        assertThat(DepositorNameNormalizer.normalize(raw)).isEqualTo("(주) ＡＢＣ·CO.,LTD");
    }

    @Test
    @DisplayName("null과 공백 전용 입력은 각각 null과 빈 문자열이다")
    void handlesBlankInput() {
        assertThat(DepositorNameNormalizer.normalize(null)).isNull();
        assertThat(DepositorNameNormalizer.normalize("\u2007\u202F")).isEmpty();
    }

    @Test
    @DisplayName("BOM은 Java Unicode 공백이 아니므로 보존한 채 대문자화한다")
    void preservesBomPrefix() {
        String normalized = DepositorNameNormalizer.normalize("\uFEFFacme");

        assertThat(normalized).isEqualTo("\uFEFFACME");
        assertThat(normalized).isNotEqualTo("ACME");
    }
}
