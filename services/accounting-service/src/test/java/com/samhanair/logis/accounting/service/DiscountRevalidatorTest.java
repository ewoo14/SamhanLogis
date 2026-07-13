package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.accounting.client.ProductLabelMatch;
import java.math.BigDecimal;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 일마감 단가변동 재검증 엔진 단위 테스트.
 *
 * <p>라벨 샘플은 product-service legacy-invoice-labels.txt 의 실제 레거시 라벨 또는
 * 스펙 §5.6/§6.4 에 명시된 실 라벨만 사용한다.
 */
class DiscountRevalidatorTest {

    private final DiscountRevalidator revalidator = new DiscountRevalidator();

    @Test
    @DisplayName("모델 토큰 추출은 product-service와 동일하게 괄호 설명 제거 후 첫 모델코드를 반환한다")
    void extractModelToken_legacyLabels() {
        assertThat(ModelTokenExtractor.extractModelToken("AC023CN1DBC1 [CN냉전 실내기]"))
                .isEqualTo("AC023CN1DBC1");
        assertThat(ModelTokenExtractor.extractModelToken("AJ040RXH4BC1 (RX다배관)"))
                .isEqualTo("AJ040RXH4BC1");
        assertThat(ModelTokenExtractor.extractModelToken("AXJ-YA1509N [N-분기관] [Y분기관]"))
                .isEqualTo("AXJ-YA1509N");
        assertThat(ModelTokenExtractor.extractModelToken("유연호스 1WAY"))
                .isEqualTo("유연호스 1WAY");
        assertThat(ModelTokenExtractor.extractModelToken("운임"))
                .isEqualTo("운임");
    }

    @Test
    @DisplayName("NOT_FOUND와 AMBIGUOUS는 판정 없이 사유 status로 단락한다")
    void unmatchedStatusesShortCircuit() {
        DiscountRevalidator.Revalidation notFound = revalidate(
                "AC023CN1DBC1 [CN냉전 실내기]", new BigDecimal("50000"),
                new BigDecimal("100000"), new BigDecimal("70000"), null,
                ProductLabelMatch.Status.NOT_FOUND);
        DiscountRevalidator.Revalidation ambiguous = revalidate(
                "AJ040RXH4BC1 (RX다배관)", new BigDecimal("55000"),
                new BigDecimal("100000"), new BigDecimal("70000"), null,
                ProductLabelMatch.Status.AMBIGUOUS);

        assertThat(notFound.status()).isEqualTo(DiscountRevalidator.Status.NOT_FOUND);
        assertThat(notFound.verified()).isNull();
        assertThat(ambiguous.status()).isEqualTo(DiscountRevalidator.Status.AMBIGUOUS);
        assertThat(ambiguous.verified()).isNull();
    }

    @Test
    @DisplayName("release 결측 또는 0은 actualRate 없이 MISSING_REFERENT로 처리한다")
    void missingReleaseIsMissingReferent() {
        DiscountRevalidator.Revalidation missing = revalidate(
                "AM023TNVDBH1 [멀티벽걸이]", new BigDecimal("55000"),
                null, new BigDecimal("70000"), new BigDecimal("45.00"),
                ProductLabelMatch.Status.MATCHED);
        DiscountRevalidator.Revalidation zero = revalidate(
                "AM023TNVDBH1 [멀티벽걸이]", new BigDecimal("55000"),
                BigDecimal.ZERO, new BigDecimal("70000"), new BigDecimal("45.00"),
                ProductLabelMatch.Status.MATCHED);

        assertThat(missing.status()).isEqualTo(DiscountRevalidator.Status.MISSING_REFERENT);
        assertThat(missing.actualRate()).isNull();
        assertThat(missing.verified()).isNull();
        assertThat(zero.status()).isEqualTo(DiscountRevalidator.Status.MISSING_REFERENT);
        assertThat(zero.actualRate()).isNull();
    }

    @Test
    @DisplayName("운임과 절삭은 referent가 있으면 확인 true로 판정한다")
    void freightAndCuttingAreVerified() {
        DiscountRevalidator.Revalidation freight = revalidate(
                "운임", new BigDecimal("10000"),
                new BigDecimal("10000"), new BigDecimal("10000"), null,
                ProductLabelMatch.Status.MATCHED);
        DiscountRevalidator.Revalidation cutting = revalidate(
                "절삭", new BigDecimal("10000"),
                new BigDecimal("10000"), new BigDecimal("10000"), null,
                ProductLabelMatch.Status.MATCHED);

        assertThat(freight.verified()).isTrue();
        assertThat(freight.status()).isEqualTo(DiscountRevalidator.Status.VERIFIED);
        assertThat(cutting.verified()).isTrue();
    }

    @Test
    @DisplayName("구형 AM/NJ/NS/AVX 토큰은 actualRate 50과 완전 일치해야 한다")
    void oldTokensRequireFiftyPercent() {
        DiscountRevalidator.Revalidation ok = revalidate(
                "AM023TNVDBH1 [멀티벽걸이]", new BigDecimal("50000"),
                new BigDecimal("100000"), new BigDecimal("70000"), null,
                ProductLabelMatch.Status.MATCHED);
        DiscountRevalidator.Revalidation fail = revalidate(
                "AM023TNVDBH1 [멀티벽걸이]", new BigDecimal("51000"),
                new BigDecimal("100000"), new BigDecimal("70000"), null,
                ProductLabelMatch.Status.MATCHED);

        assertThat(ok.actualRate()).isEqualTo(50);
        assertThat(ok.expectedRate()).isEqualTo(50);
        assertThat(ok.verified()).isTrue();
        assertThat(fail.actualRate()).isEqualTo(49);
        assertThat(fail.verified()).isFalse();
    }

    @Test
    @DisplayName("액세서리는 정수원 납품가와 compareTo 기준 완전 일치해야 한다")
    void accessoriesRequireDeliveryPriceExactIntegerWon() {
        DiscountRevalidator.Revalidation flexibleHose = revalidate(
                "유연호스 1WAY", new BigDecimal("70000.00"),
                new BigDecimal("100000"), new BigDecimal("70000"), null,
                ProductLabelMatch.Status.MATCHED);
        DiscountRevalidator.Revalidation branchPipe = revalidate(
                "AXJ-YA1509N [N-분기관] [Y분기관]", new BigDecimal("70001"),
                new BigDecimal("100000"), new BigDecimal("70000"), null,
                ProductLabelMatch.Status.MATCHED);

        assertThat(flexibleHose.verified()).isTrue();
        assertThat(flexibleHose.expectedRate()).isNull();
        assertThat(branchPipe.verified()).isFalse();
    }

    @Test
    @DisplayName("멀티 fixedDc는 percent 값을 재×100 하지 않고 HALF_UP 정수 반올림한다")
    void multiFixedDiscountPercentScale() {
        DiscountRevalidator.Revalidation fixed45 = revalidate(
                "AJ040RXH4BC1 (RX다배관)", new BigDecimal("55000"),
                new BigDecimal("100000"), new BigDecimal("70000"), new BigDecimal("45.00"),
                ProductLabelMatch.Status.MATCHED);
        DiscountRevalidator.Revalidation fixedZero = revalidate(
                "AJ040RXH4BC1 (RX다배관)", new BigDecimal("100000"),
                new BigDecimal("100000"), new BigDecimal("70000"), BigDecimal.ZERO,
                ProductLabelMatch.Status.MATCHED);

        assertThat(fixed45.expectedRate()).isEqualTo(45);
        assertThat(fixed45.actualRate()).isEqualTo(45);
        assertThat(fixed45.verified()).isTrue();
        assertThat(fixedZero.expectedRate()).isZero();
        assertThat(fixedZero.verified()).isTrue();
    }

    @Test
    @DisplayName("멀티 fixedDc null은 45 폴백이며 null과 0을 구분한다")
    void multiNullFixedDiscountFallsBackToFortyFive() {
        DiscountRevalidator.Revalidation result = revalidate(
                "AJ040RXH4BC1 (RX다배관)", new BigDecimal("55000"),
                new BigDecimal("100000"), new BigDecimal("70000"), null,
                ProductLabelMatch.Status.MATCHED);

        assertThat(result.expectedRate()).isEqualTo(45);
        assertThat(result.verified()).isTrue();
    }

    @Test
    @DisplayName("정수 할인율은 BigDecimal HALF_UP으로 .5 경계를 반올림한다")
    void actualRateRoundsHalfUp() {
        DiscountRevalidator.Revalidation result = revalidate(
                "AJ040RXH4BC1 (RX다배관)", new BigDecimal("54500"),
                new BigDecimal("100000"), new BigDecimal("70000"), new BigDecimal("46.00"),
                ProductLabelMatch.Status.MATCHED);

        assertThat(result.actualRate()).isEqualTo(46);
        assertThat(result.expectedRate()).isEqualTo(46);
        assertThat(result.verified()).isTrue();
    }

    @Test
    @DisplayName("세트 의존 싱글 본체/부속 토큰은 S1.5 대기 OUT_OF_SCOPE로 남긴다")
    void singleSetDependentIsOutOfScope() {
        DiscountRevalidator.Revalidation result = revalidate(
                "AC023CN1DBC1 [CN냉전 실내기]", new BigDecimal("80000"),
                new BigDecimal("100000"), new BigDecimal("70000"), null,
                ProductLabelMatch.Status.MATCHED);

        assertThat(result.status()).isEqualTo(DiscountRevalidator.Status.OUT_OF_SCOPE);
        assertThat(result.verified()).isNull();
    }

    @Test
    @DisplayName("기타 라벨은 레거시 default와 같이 확인 true로 판정한다")
    void defaultBranchIsVerified() {
        DiscountRevalidator.Revalidation result = revalidate(
                "기타 실 라벨", new BigDecimal("80000"),
                new BigDecimal("100000"), new BigDecimal("70000"), null,
                ProductLabelMatch.Status.MATCHED);

        assertThat(result.status()).isEqualTo(DiscountRevalidator.Status.VERIFIED);
        assertThat(result.verified()).isTrue();
    }

    @Test
    @DisplayName("effectiveUnitPrice null(qty=0 방어)은 actualRate null로 유지하고 비교 분기는 false가 된다")
    void nullEffectiveUnitPriceFromZeroQuantity() {
        DiscountRevalidator.Revalidation result = revalidate(
                "AJ040RXH4BC1 (RX다배관)", null,
                new BigDecimal("100000"), new BigDecimal("70000"), new BigDecimal("45.00"),
                ProductLabelMatch.Status.MATCHED);

        assertThat(result.status()).isEqualTo(DiscountRevalidator.Status.VERIFIED);
        assertThat(result.actualRate()).isNull();
        assertThat(result.expectedRate()).isEqualTo(45);
        assertThat(result.verified()).isFalse();
    }

    private DiscountRevalidator.Revalidation revalidate(
            String itemName,
            BigDecimal effectiveUnitPrice,
            BigDecimal release,
            BigDecimal delivery,
            BigDecimal fixedDc,
            ProductLabelMatch.Status matchStatus) {
        return revalidator.revalidate(
                itemName,
                ModelTokenExtractor.extractModelToken(itemName),
                effectiveUnitPrice,
                release,
                delivery,
                fixedDc,
                matchStatus);
    }
}
