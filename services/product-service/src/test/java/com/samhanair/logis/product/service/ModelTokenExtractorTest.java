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
    void boundaryNoiseOutsideBrackets_stillExtractsExactToken() {
        // clean() 이 제거하지 않는 대괄호 밖 텍스트(선행/후행)가 남아도 find() 가 실제 토큰
        // 경계에서 정확히 멈추는지 검증한다 (기존 267개 fixture 는 clean 후 단일토큰이라 미검증).
        assertThat(ModelTokenExtractor.extractModelToken("구형 AC023CN1DBC1 재고"))
                .isEqualTo("AC023CN1DBC1");
        assertThat(ModelTokenExtractor.extractModelToken("[구형] AC023CN1DBC1 실내기 여분"))
                .isEqualTo("AC023CN1DBC1");
    }

    @Test
    void shortCode_belowMainRegexMinLength_reachesArArrFallback() {
        // "AR-99"/"ARR-5" 는 접두 이후 문자수가 메인 정규식 {4,} 요건에 못 미쳐 find() 가 실패하고
        // (자체 확인: MODEL_TOKEN.matcher(...).find() == false) startsWith("AR-")/("ARR-") fallback 으로 도달한다.
        assertThat(MODEL_TOKEN.matcher("AR-99 무선리모컨".toUpperCase(java.util.Locale.ROOT)).find())
                .as("AR-99 는 메인 정규식 {4,} 미달로 find() 가 false 여야 fallback 분기가 진짜 실행된다")
                .isFalse();
        assertThat(MODEL_TOKEN.matcher("ARR-5 무선컨트롤러".toUpperCase(java.util.Locale.ROOT)).find())
                .as("ARR-5 도 동일 이유로 메인 정규식 미매칭이어야 한다")
                .isFalse();

        assertThat(ModelTokenExtractor.extractModelToken("AR-99 무선리모컨"))
                .isEqualTo("AR-99");
        assertThat(ModelTokenExtractor.extractModelToken("ARR-5 무선컨트롤러"))
                .isEqualTo("ARR-5");
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
