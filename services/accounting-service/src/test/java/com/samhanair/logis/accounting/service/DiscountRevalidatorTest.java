package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.accounting.client.ProductLabelMatch;
import java.math.BigDecimal;
import java.util.List;
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
    @DisplayName("운임과 절삭은 라벨 매칭과 referent 없이도 확인 true로 판정한다")
    void freightAndCuttingAreVerified() {
        DiscountRevalidator.Revalidation freight = revalidate(
                "운임", new BigDecimal("10000"),
                null, null, null,
                ProductLabelMatch.Status.NOT_FOUND);
        DiscountRevalidator.Revalidation cutting = revalidate(
                "절삭", new BigDecimal("10000"),
                null, null, null,
                ProductLabelMatch.Status.MATCHED);

        assertThat(freight.verified()).isTrue();
        assertThat(freight.status()).isEqualTo(DiscountRevalidator.Status.VERIFIED);
        assertThat(freight.actualRate()).isNull();
        assertThat(cutting.verified()).isTrue();
        assertThat(cutting.status()).isEqualTo(DiscountRevalidator.Status.VERIFIED);
    }

    @Test
    @DisplayName("구형 전용 접두(NJ/NS/AVX)는 actualRate 50과 완전 일치해야 한다")
    void oldTokensRequireFiftyPercent() {
        // NJ/NS/AVX 는 레거시 구형 전용 접두(Code.js:676)로 현행 dev 카탈로그엔 부재 — 분류 규칙 검증용.
        // AM 은 상업멀티 접두이므로 commercialMultiAmRoutesToMultiNotFifty 로 별도 검증한다.
        DiscountRevalidator.Revalidation ok = revalidate(
                "NS080MWXVGW", new BigDecimal("50000"),
                new BigDecimal("100000"), new BigDecimal("70000"), null,
                ProductLabelMatch.Status.MATCHED);
        DiscountRevalidator.Revalidation fail = revalidate(
                "NS080MWXVGW", new BigDecimal("51000"),
                new BigDecimal("100000"), new BigDecimal("70000"), null,
                ProductLabelMatch.Status.MATCHED);

        assertThat(ok.actualRate()).isEqualTo(50);
        assertThat(ok.expectedRate()).isEqualTo(50);
        assertThat(ok.verified()).isTrue();
        assertThat(fail.actualRate()).isEqualTo(49);
        assertThat(fail.verified()).isFalse();
    }

    @Test
    @DisplayName("상업멀티 AM(zone marker X/N)은 구형50%가 아니라 멀티 분기(고정dc/45)로 판정한다")
    void commercialMultiAmRoutesToMultiNotFifty() {
        // 실 라벨 AM023TNVDBH1 (char[6]='N' = 상업멀티). BE 리뷰 R1 회귀 방지:
        // OLD_FIFTY_PREFIX(^AM)가 멀티보다 먼저 발동해 상업멀티를 50%로 오분류하던 결함 fix 검증.
        DiscountRevalidator.Revalidation fixed = revalidate(
                "AM023TNVDBH1 [멀티벽걸이]", new BigDecimal("55000"),
                new BigDecimal("100000"), new BigDecimal("70000"), new BigDecimal("45.00"),
                ProductLabelMatch.Status.MATCHED);
        DiscountRevalidator.Revalidation fallback = revalidate(
                "AM023TNVDBH1 [멀티벽걸이]", new BigDecimal("55000"),
                new BigDecimal("100000"), new BigDecimal("70000"), null,
                ProductLabelMatch.Status.MATCHED);

        assertThat(fixed.expectedRate()).isEqualTo(45); // 50 이 아님
        assertThat(fixed.actualRate()).isEqualTo(45);
        assertThat(fixed.verified()).isTrue();
        assertThat(fallback.expectedRate()).isEqualTo(45); // fixedDc null → 45 폴백
        assertThat(fallback.verified()).isTrue();
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
        DiscountRevalidator.Revalidation zeroDeliveryFallsBackToRelease = revalidate(
                "AXJ-YA1509N [N-분기관] [Y분기관]", new BigDecimal("100000"),
                new BigDecimal("100000"), BigDecimal.ZERO, null,
                ProductLabelMatch.Status.MATCHED);

        assertThat(flexibleHose.verified()).isTrue();
        assertThat(flexibleHose.expectedRate()).isNull();
        assertThat(branchPipe.verified()).isFalse();
        assertThat(zeroDeliveryFallsBackToRelease.verified()).isTrue();
        assertThat(zeroDeliveryFallsBackToRelease.deliveryPrice()).isEqualByComparingTo("100000");
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
    @DisplayName("품목 고정DC율은 전역 45% 기본값보다 우선한다")
    void fixedDiscountRateWinsOverGlobalDefault() {
        DiscountRevalidator.Revalidation fixed30 = revalidate(
                "AJ040RXH4BC1 (RX다배관)", new BigDecimal("70000"),
                new BigDecimal("100000"), new BigDecimal("70000"), new BigDecimal("30.00"),
                ProductLabelMatch.Status.MATCHED);

        assertThat(fixed30.expectedRate()).isEqualTo(30);
        assertThat(fixed30.actualRate()).isEqualTo(30);
        assertThat(fixed30.verified()).isTrue();
    }

    @Test
    @DisplayName("고정DC 30%와 거래처 전역DC 48%가 다르면 고정DC 30%를 적용한다")
    void fixedDiscountRateWinsOverDifferentGlobalRate() {
        DiscountRevalidator.Revalidation result = revalidator.revalidate(
                "AJ040RXH4BC1 (RX다배관)",
                ModelTokenExtractor.extractModelToken("AJ040RXH4BC1 (RX다배관)"),
                new BigDecimal("70000"),
                new BigDecimal("100000"),
                new BigDecimal("70000"),
                new BigDecimal("30.00"),
                DiscountRevalidator.GlobalDiscount.found(
                        new BigDecimal("0.48"), new BigDecimal("0.48")),
                ProductLabelMatch.Status.MATCHED);

        assertThat(result.expectedRate()).isEqualTo(30);
        assertThat(result.actualRate()).isEqualTo(30);
        assertThat(result.verified()).isTrue();
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
    @DisplayName("거래처 전역DC 48%는 고정DC가 없을 때 45%가 아니라 48%를 기대한다")
    void multiGlobalDiscountRateFortyEightPercentIsUsedWhenFixedRateIsAbsent() {
        DiscountRevalidator.Revalidation result = revalidator.revalidate(
                "AJ040RXH4BC1 (RX다배관)",
                ModelTokenExtractor.extractModelToken("AJ040RXH4BC1 (RX다배관)"),
                new BigDecimal("52000"),
                new BigDecimal("100000"),
                new BigDecimal("70000"),
                null,
                DiscountRevalidator.GlobalDiscount.found(
                        new BigDecimal("0.48"), new BigDecimal("0.48")),
                ProductLabelMatch.Status.MATCHED);

        assertThat(result.expectedRate()).isEqualTo(48);
        assertThat(result.actualRate()).isEqualTo(48);
        assertThat(result.verified()).isTrue();
    }

    @Test
    @DisplayName("거래처 전역DC를 찾지 못하면 45%로 조용히 판정하지 않는다")
    void missingGlobalDiscountIsVisible() {
        DiscountRevalidator.Revalidation result = revalidator.revalidate(
                "AJ040RXH4BC1 (RX다배관)",
                ModelTokenExtractor.extractModelToken("AJ040RXH4BC1 (RX다배관)"),
                new BigDecimal("55000"),
                new BigDecimal("100000"),
                new BigDecimal("70000"),
                null,
                DiscountRevalidator.GlobalDiscount.unavailable(),
                ProductLabelMatch.Status.MATCHED);

        assertThat(result.status()).isEqualTo(DiscountRevalidator.Status.MISSING_GLOBAL_DISCOUNT);
        assertThat(result.verified()).isNull();
        assertThat(result.expectedRate()).isNull();
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
    @DisplayName("싱글중대형은 실제 DC액이 기준 납품가와 맞으면 확인한다")
    void singleSetDependentValidatesDiscountAmount() {
        DiscountRevalidator.Revalidation result = revalidate(
                "AC023CN1DBC1 [CN냉전 실내기]", new BigDecimal("70000"),
                new BigDecimal("100000"), new BigDecimal("70000"), null,
                ProductLabelMatch.Status.MATCHED);

        assertThat(result.status()).isEqualTo(DiscountRevalidator.Status.VERIFIED);
        assertThat(result.verified()).isTrue();
        assertThat(result.discountAmount()).isEqualByComparingTo("30000");
    }

    @Test
    @DisplayName("싱글 세트 옵션 정액 DC 6종은 기대 납품금액에서 차감된다")
    void singleSetOptionDiscountIsApplied() {
        DiscountRevalidator.Revalidation result = revalidator.revalidate(
                "AC123456P", "AC123456P", new BigDecimal("68000"),
                new BigDecimal("100000"), new BigDecimal("70000"), null,
                DiscountRevalidator.GlobalDiscount.found(
                        new BigDecimal("0.45"), new BigDecimal("0.45"),
                        new BigDecimal("2000"), null, null, null, null, null),
                ProductLabelMatch.Status.MATCHED);

        assertThat(result.verified()).isTrue();
        assertThat(result.discountAmount()).isEqualByComparingTo("32000");
    }

    @Test
    @DisplayName("옵션 정액 6종은 레거시 세트코드별로 각각 선택되고 미보유 거래처는 기존 결과를 유지한다")
    void allSingleSetOptionDiscountsAndNoOptionParity() {
        List<String> tokens = List.of(
                "AC123456P", "AC123454P", "AC123451D", "AP230123P", "AP123456D1H", "AP123456F");
        List<BigDecimal> amounts = List.of(
                new BigDecimal("1000"), new BigDecimal("2000"), new BigDecimal("3000"),
                new BigDecimal("4000"), new BigDecimal("5000"), new BigDecimal("6000"));
        for (int i = 0; i < tokens.size(); i++) {
            DiscountRevalidator.Revalidation result = revalidator.revalidate(
                    tokens.get(i), tokens.get(i), new BigDecimal("100000").subtract(amounts.get(i)),
                    new BigDecimal("150000"), new BigDecimal("100000"), null,
                    DiscountRevalidator.GlobalDiscount.found(
                            new BigDecimal("0.45"), new BigDecimal("0.45"),
                            amounts.get(0), amounts.get(1), amounts.get(2), amounts.get(3), amounts.get(4), amounts.get(5)),
                    ProductLabelMatch.Status.MATCHED);
            assertThat(result.verified()).as(tokens.get(i)).isTrue();
        }

        DiscountRevalidator.Revalidation withoutOption = revalidator.revalidate(
                "AC123456P", "AC123456P", new BigDecimal("100000"),
                new BigDecimal("150000"), new BigDecimal("100000"), null,
                ProductLabelMatch.Status.MATCHED);
        assertThat(withoutOption.verified()).isTrue();
        assertThat(withoutOption.discountAmount()).isEqualByComparingTo("50000");
    }

    @Test
    @DisplayName("싱글중대형은 DC액이 틀리면 불일치로 판정한다")
    void singleSetDependentRejectsWrongDiscountAmount() {
        DiscountRevalidator.Revalidation result = revalidate(
                "AC023CN1DBC1 [CN냉전 실내기]", new BigDecimal("80000"),
                new BigDecimal("100000"), new BigDecimal("70000"), null,
                ProductLabelMatch.Status.MATCHED);

        assertThat(result.status()).isEqualTo(DiscountRevalidator.Status.VERIFIED);
        assertThat(result.verified()).isFalse();
        assertThat(result.discountAmount()).isEqualByComparingTo("20000");
    }

    @Test
    @DisplayName("싱글중대형 7개 정본 접두는 모두 DC액 검증 분기로 진입한다")
    void allSingleSetDependentPrefixesAreValidated() {
        for (String modelToken : List.of(
                "AC023CN1DBC1", "AP230P1ABCDE", "AR07TXEAAWKNEU-03", "AF15BX1NWAEAH-31",
                "PC12345", "AWR12345", "ARR-1234")) {
            DiscountRevalidator.Revalidation result = revalidator.revalidate(
                    modelToken, modelToken, new BigDecimal("70000"),
                    new BigDecimal("100000"), new BigDecimal("70000"), null,
                    ProductLabelMatch.Status.MATCHED);

            assertThat(result.status()).as(modelToken).isEqualTo(DiscountRevalidator.Status.VERIFIED);
            assertThat(result.verified()).as(modelToken).isTrue();
            assertThat(result.discountAmount()).as(modelToken).isEqualByComparingTo("30000");
        }
    }

    @Test
    @DisplayName("싱글중대형은 유효단가를 만들 수 없으면 조용히 통과시키지 않는다")
    void singleSetDependentUnknownWhenNotMeasurable() {
        DiscountRevalidator.Revalidation result = revalidate(
                "AC023CN1DBC1 [CN냉전 실내기]", null,
                new BigDecimal("100000"), new BigDecimal("70000"), null,
                ProductLabelMatch.Status.MATCHED);

        assertThat(result.status()).isEqualTo(DiscountRevalidator.Status.NOT_MEASURABLE);
        assertThat(result.verified()).isNull();
        assertThat(result.discountAmount()).isNull();
    }

    @Test
    @DisplayName("싱글중대형 재검증은 같은 입력을 반복해도 같은 결과를 낸다")
    void singleSetDependentRevalidationIsIdempotent() {
        DiscountRevalidator.Revalidation first = revalidate(
                "AC023CN1DBC1 [CN냉전 실내기]", new BigDecimal("70000"),
                new BigDecimal("100000"), new BigDecimal("70000"), null,
                ProductLabelMatch.Status.MATCHED);
        DiscountRevalidator.Revalidation second = revalidate(
                "AC023CN1DBC1 [CN냉전 실내기]", new BigDecimal("70000"),
                new BigDecimal("100000"), new BigDecimal("70000"), null,
                ProductLabelMatch.Status.MATCHED);

        assertThat(second).isEqualTo(first);
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
    @DisplayName("effectiveUnitPrice null(qty=0)은 판정 실패가 아니라 NOT_MEASURABLE로 단락한다")
    void nullEffectiveUnitPriceIsNotMeasurable() {
        DiscountRevalidator.Revalidation result = revalidate(
                "AJ040RXH4BC1 (RX다배관)", null,
                new BigDecimal("100000"), new BigDecimal("70000"), new BigDecimal("45.00"),
                ProductLabelMatch.Status.MATCHED);

        assertThat(result.status()).isEqualTo(DiscountRevalidator.Status.NOT_MEASURABLE);
        assertThat(result.actualRate()).isNull();
        assertThat(result.expectedRate()).isEqualTo(45); // 기대율은 보존
        assertThat(result.verified()).isNull(); // 실패(false)가 아닌 판정 불가(null)
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
