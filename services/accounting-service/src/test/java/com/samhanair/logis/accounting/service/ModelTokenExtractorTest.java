package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * #773 S5 — ModelTokenExtractor(accounting 포트) 계약 테스트.
 *
 * <p>{@code extractModelTokenOrNull}(표시 전용·S5 신규)과 {@code extractModelToken}(재검증 분기용)의
 * 의도된 계약을 고정한다. 두 메서드는 동일한 {@code clean()}(대괄호 3종 내용 제거) 기반 추출을 공유하되,
 * 미매치 시 표시 전용은 null·분기용은 정규화 품명 fallback 으로만 갈린다 — 이 정합이 모델 컬럼과
 * 재검증 판정의 일관성을 보장한다.
 */
class ModelTokenExtractorTest {

    @Test
    void orNull_realModelOutsideBrackets_returnsToken() {
        // 실 라벨은 모델을 대괄호 '밖', 규격/설명을 '안'에 둔다(실측 대괄호 안 모델 0건).
        assertThat(ModelTokenExtractor.extractModelTokenOrNull("AR09TXEAAWKNEU-04 삼성 윈드프리 9평형"))
                .isEqualTo("AR09TXEAAWKNEU-04");
        assertThat(ModelTokenExtractor.extractModelTokenOrNull("AM160NXVHHH1 [상업멀티]"))
                .isEqualTo("AM160NXVHHH1");
        assertThat(ModelTokenExtractor.extractModelTokenOrNull("AC023CN1DBC1 [CN냉전 실내기]"))
                .isEqualTo("AC023CN1DBC1");
    }

    @Test
    void orNull_serviceOrFreightLabel_returnsNull() {
        // 미매치(운임·서비스)는 표시 전용에서 null → FE '—'. 품명 fallback 안 함(품명 컬럼 중복 방지).
        assertThat(ModelTokenExtractor.extractModelTokenOrNull("특송 기본료")).isNull();
        assertThat(ModelTokenExtractor.extractModelTokenOrNull("포장재 비용")).isNull();
    }

    @Test
    void orNull_nullOrBlank_returnsNull() {
        assertThat(ModelTokenExtractor.extractModelTokenOrNull(null)).isNull();
        assertThat(ModelTokenExtractor.extractModelTokenOrNull("   ")).isNull();
    }

    @Test
    void orNull_fullyBracketedModel_returnsNull_consistentWithRevalidationBasis() {
        // 모델이 통째로 대괄호 안이면 clean() 이 제거 → null. 재검증 분기용 extractModelToken 과 동일
        // 추출 기반이라 표시 modelName 이 재검증 토큰과 정합하도록 하는 의도된 동작(실 데이터 0건·회귀 가드).
        assertThat(ModelTokenExtractor.extractModelTokenOrNull("[AR09TXEAAWKNEU-04]")).isNull();
    }

    @Test
    void orNull_arArrShortPrefix_reachesFallbackLikeExtractModelToken() {
        // AR-/ARR- 접두 fallback 은 분기용과 대칭. 표시 전용도 동일 토큰(정합).
        assertThat(ModelTokenExtractor.extractModelTokenOrNull("AR-99 무선리모컨")).isEqualTo("AR-99");
        assertThat(ModelTokenExtractor.extractModelTokenOrNull("ARR-5 무선컨트롤러")).isEqualTo("ARR-5");
    }

    @Test
    void extractModelToken_serviceLabel_fallsBackToNormalizedName() {
        // 분기용은 미매치 시 정규화 품명 fallback(표시 전용의 null 과 대비) — S5 표시 컬럼의 핵심 차이.
        assertThat(ModelTokenExtractor.extractModelToken("특송 기본료")).isEqualTo("특송 기본료");
        assertThat(ModelTokenExtractor.extractModelToken("포장재 비용")).isEqualTo("포장재 비용");
    }

    @Test
    void extractModelToken_realModel_equalsOrNull() {
        // 매치 케이스는 두 메서드 결과 동일(표시=분기 토큰 정합).
        assertThat(ModelTokenExtractor.extractModelToken("AR09TXEAAWKNEU-04 삼성 윈드프리 9평형"))
                .isEqualTo(ModelTokenExtractor.extractModelTokenOrNull("AR09TXEAAWKNEU-04 삼성 윈드프리 9평형"));
    }

    @Test
    void extractModelToken_nullOrBlank_returnsEmpty() {
        assertThat(ModelTokenExtractor.extractModelToken(null)).isEmpty();
        assertThat(ModelTokenExtractor.extractModelToken("   ")).isEmpty();
    }
}
