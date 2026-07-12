package com.samhanair.logis.product.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

class ModelTokenExtractorTest {

    private static final Pattern MODEL_TOKEN =
            Pattern.compile("\\b(AC|AP|AR|AF|AM|AJ|AXJ|PC|AWR|ARR)[A-Z0-9\\-]{4,}\\b");

    @Test
    void legacyInvoiceLabels_extractNonBlankModelToken() throws IOException {
        ClassPathResource resource =
                new ClassPathResource("label-mapping-fixtures/legacy-invoice-labels.txt");

        try (var reader = resource.getContentAsString(StandardCharsets.UTF_8).lines()) {
            assertThat(reader.filter(line -> !line.isBlank())
                    .map(ModelTokenExtractor::extractModelToken))
                    .allSatisfy(token -> assertThat(token)
                            .isNotBlank()
                            .matches(MODEL_TOKEN));
        }
    }

    @Test
    void extractsRepresentativeLegacyLabels() {
        assertThat(ModelTokenExtractor.extractModelToken("AC023CN1DBC1 [CN냉전 실내기]"))
                .isEqualTo("AC023CN1DBC1");
        assertThat(ModelTokenExtractor.extractModelToken("AJ040RXH4BC1 (RX냉방기)"))
                .isEqualTo("AJ040RXH4BC1");
        assertThat(ModelTokenExtractor.extractModelToken("AC023CN1PBH1 [CN프레스티지 실내기] [냉난방 1w]"))
                .isEqualTo("AC023CN1PBH1");
        assertThat(ModelTokenExtractor.extractModelToken("AC040CX1DBC1 [CX냉전 실외기] [\u200B]"))
                .isEqualTo("AC040CX1DBC1");
        assertThat(ModelTokenExtractor.extractModelToken("AR-XXXX 테스트 라벨"))
                .isEqualTo("AR-XXXX");
        assertThat(ModelTokenExtractor.extractModelToken("ARR-1234 테스트 라벨"))
                .isEqualTo("ARR-1234");
        assertThat(ModelTokenExtractor.extractModelToken("포장재 비용"))
                .isEqualTo("포장재 비용");
    }

    @Test
    void clean_removesBracketParenBraceContents() {
        assertThat(ModelTokenExtractor.clean(null)).isEmpty();
        assertThat(ModelTokenExtractor.clean("  AC023 [대괄호] (소괄호) {중괄호}  "))
                .isEqualTo("AC023");
    }

    @Test
    void blankInput_extractsEmptyToken() {
        assertThat(ModelTokenExtractor.extractModelToken(null)).isEmpty();
        assertThat(ModelTokenExtractor.extractModelToken("   ")).isEmpty();
    }
}
