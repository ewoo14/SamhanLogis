package com.samhanair.logis.slip.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("전표 라인 권위 금액 팩토리")
class SlipLineAuthoritativeAmountsTest {

    @Test
    @DisplayName("재수렴 4차(#937): 두 단가 컬럼은 서로 다른 세금 도메인을 담는다 — "
            + "unit_price = 공급가액/수량(VAT 제외), unit_price_with_vat = 요청 단가(VAT 포함)")
    void storesEachUnitPriceColumnInItsOwnTaxDomain() {
        // 화면(SlipFormPage/SlipDetailPage)이 보내는 단가는 2026-06-09 정책상 VAT 포함이다.
        // 수량 2 · 단가(VAT 포함) 110,000 → 공급가액 200,000 · 부가세 20,000 · 합계 220,000.
        SlipLine line = SlipLine.createFromAuthoritativeAmounts(
                newOutbound(), UUID.randomUUID(), "품목", "모델", null, 2,
                new BigDecimal("110000"), new BigDecimal("200000"), new BigDecimal("20000"),
                new BigDecimal("220000"), null, null);

        // RED(수정 전): 요청 단가를 두 컬럼에 그대로 각인해 unit_price 가 110,000 이 된다 —
        // 세금계산서/매입전표 인쇄가 읽는 항등식(단가 x 수량 = 공급가액)이 220,000 != 200,000 으로 깨진다.
        assertThat(line.getUnitPrice()).isEqualByComparingTo("100000");
        assertThat(line.getUnitPriceWithVat()).isEqualByComparingTo("110000");
        assertThat(line.getUnitPrice().multiply(BigDecimal.valueOf(2)))
                .isEqualByComparingTo(line.getSupplyAmount());
    }

    @Test
    @DisplayName("재수렴 4차(#937): 무수정 재저장은 저장된 두 단가 컬럼을 바꾸지 않는다 "
            + "(감사 이력이 사용자가 하지 않은 변경을 기록하지 않는다)")
    void noOpResaveKeepsBothUnitPriceColumnsStable() {
        SlipLine first = SlipLine.createFromAuthoritativeAmounts(
                newOutbound(), UUID.randomUUID(), "품목", "모델", null, 2,
                new BigDecimal("110000"), new BigDecimal("200000"), new BigDecimal("20000"),
                new BigDecimal("220000"), null, null);

        // 화면 하이드레이션이 다시 실어 보내는 값 = VAT 포함 단가(= 저장된 unit_price_with_vat).
        SlipLine resaved = SlipLine.createFromAuthoritativeAmounts(
                newOutbound(), UUID.randomUUID(), "품목", "모델", null, 2,
                first.getUnitPriceWithVat(), first.getSupplyAmount(), first.getVatAmount(),
                first.getSupplyAmount().add(first.getVatAmount()), null, null);

        assertThat(resaved.getUnitPrice()).isEqualByComparingTo(first.getUnitPrice());
        assertThat(resaved.getUnitPriceWithVat()).isEqualByComparingTo(first.getUnitPriceWithVat());
    }

    @Test
    @DisplayName("D-3: 권위 금액을 편집해도 요청 단가를 VAT 포함 컬럼에 잃지 않고 보존한다")
    void preservesRequestedUnitPriceForAuthoritativeAmounts() {
        SlipLine line = SlipLine.createFromAuthoritativeAmounts(
                newOutbound(), UUID.randomUUID(), "품목", "모델", null, 2,
                new BigDecimal("11000"), new BigDecimal("50000"), new BigDecimal("2000"),
                new BigDecimal("52000"), null, null);

        // 재수렴 4차(#937): D-3 의 의도는 "요청 단가를 잃지 않는다" 였고 그 계약은 그대로다 —
        // 다만 그것을 VAT 포함 컬럼 하나에만 담는다. 종전 단언(unit_price 도 11,000)은 결함
        // 자체를 고정한 것이었다: 이 케이스는 공급가액 50,000·수량 2 이므로 VAT 제외 공급단가는
        // 정의상 25,000 이고, 11,000 × 2 = 22,000 != 50,000 이라 세금계산서·매입전표 인쇄가
        // 읽는 항등식(단가 x 수량 = 공급가액)이 애초에 깨진 값이었다.
        assertThat(line.getUnitPrice()).isEqualByComparingTo("25000");
        assertThat(line.getUnitPriceWithVat()).isEqualByComparingTo("11000");
        assertThat(line.getSupplyAmount()).isEqualByComparingTo("50000");
        assertThat(line.getVatAmount()).isEqualByComparingTo("2000");
        assertThat(line.getLineTotal()).isEqualByComparingTo("50000");
    }

    @Test
    @DisplayName("끝수 공급가액을 보존하고 부가세·VAT 포함 합계를 그대로 저장한다")
    void createsFromAuthoritativeAmountsWithoutRecalculation() {
        Slip slip = newOutbound();

        SlipLine line = SlipLine.createFromAuthoritativeAmounts(
                slip, UUID.randomUUID(), "품목", "모델", null, 3,
                new BigDecimal("100005"), new BigDecimal("10001"), new BigDecimal("110006"),
                null, null);

        assertThat(line.getSupplyAmount()).isEqualByComparingTo("100005");
        assertThat(line.getVatAmount()).isEqualByComparingTo("10001");
        assertThat(line.getLineTotal()).isEqualByComparingTo("100005");
        assertThat(line.getUnitPriceWithVat()).isEqualByComparingTo("36668.67");
    }

    @Test
    @DisplayName("공급가액+부가세와 VAT 포함 합계가 다르면 INVALID_INPUT으로 거부한다")
    void rejectsMismatchedTotal() {
        assertThatThrownBy(() -> SlipLine.createFromAuthoritativeAmounts(
                newOutbound(), UUID.randomUUID(), "품목", null, null, 1,
                new BigDecimal("100005"), new BigDecimal("10000"), new BigDecimal("110006"),
                null, null))
                .isInstanceOf(BusinessException.class)
                .satisfies(error -> {
                    BusinessException exception = (BusinessException) error;
                    assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT);
                    assertThat(exception.getMessage()).contains("공급가액").contains("합");
                });
    }

    @Test
    @DisplayName("금액 소수와 음수는 저장 전에 거부한다")
    void rejectsNegativeOrFractionalAmount() {
        assertThatThrownBy(() -> SlipLine.createFromAuthoritativeAmounts(
                newOutbound(), UUID.randomUUID(), "품목", null, null, 1,
                new BigDecimal("1000.50"), new BigDecimal("100"), new BigDecimal("1100.50"),
                null, null))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_INPUT);

        assertThatThrownBy(() -> SlipLine.createFromAuthoritativeAmounts(
                newOutbound(), UUID.randomUUID(), "품목", null, null, 1,
                new BigDecimal("1000"), new BigDecimal("-1"), new BigDecimal("999"),
                null, null))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_INPUT);
    }

    @Test
    @DisplayName("MED-4(#824 R1): 정수 자릿수 15자리 초과(1E+17 류 압축표기)는 precision 우회를 저장 전에 거부한다")
    void rejectsIntegerDigitOverflowViaCompactScale() {
        // stripTrailingZeros().precision() 만으로는 1E+17(unscaled=1, scale=-17) 이 precision=1 로
        // 측정돼 NUMERIC(15,2) 초과(18자리)를 통과시켰다 — 화면에서 "1" 뒤 0을 17개 입력하면 도달.
        // supply=vat=0, total=supply 로 구성해 mismatch 가드보다 먼저 자릿수 가드에서 걸리는지 검증한다.
        assertThatThrownBy(() -> SlipLine.createFromAuthoritativeAmounts(
                newOutbound(), UUID.randomUUID(), "품목", null, null, 1,
                new BigDecimal("1E+17"), BigDecimal.ZERO, new BigDecimal("1E+17"),
                null, null))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_INPUT);
    }

    @Test
    @DisplayName("MED-4(#824 R2): quantity=1 에서 15자리 공급가액은 파생 단가(narrow 컬럼 "
            + "unit_price NUMERIC(15,2), 13자리 한계)가 넘쳐 거부해야 한다 — R1(#824 R1)의 "
            + "단일 임계값(정수부 15 고정)이 놓친 사각지대. R1 당시엔 supplyAmount(wide 컬럼, "
            + "실제로는 17,2/15자리) 자체만 봐서 '허용'으로 오판했으나, 나눗셈 마진이 없는 "
            + "quantity=1 에서는 파생 unitPrice 도 15자리가 되어 narrow 컬럼(13자리)을 실제로 "
            + "overflow 한다(실 Postgres IT: SlipLineAmountOverflowControllerIT).")
    void rejectsFifteenDigitSupplyAtQuantityOneBecauseDerivedUnitPriceOverflowsNarrowColumn() {
        assertThatThrownBy(() -> SlipLine.createFromAuthoritativeAmounts(
                newOutbound(), UUID.randomUUID(), "품목", null, null, 1,
                new BigDecimal("999999999999999"), BigDecimal.ZERO, new BigDecimal("999999999999999"),
                null, null))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_INPUT);
    }

    @Test
    @DisplayName("MED-4(#824 R2): 15자리 공급가액도 수량이 커서 파생 단가가 narrow 컬럼(13자리) "
            + "안에 들어가면 허용한다 — wide 컬럼(supply_amount/line_total) 자체 한계는 "
            + "정수부 15자리가 맞다(수량 곱셈 마진, V1 컨벤션 주석). R1 의도(15자리 wide 컬럼 "
            + "허용)를 올바른 경계로 보존하는 회귀 방지 테스트.")
    void acceptsExactlyFifteenIntegerDigitsInWideColumnWhenPerUnitFitsNarrowColumn() {
        SlipLine line = SlipLine.createFromAuthoritativeAmounts(
                newOutbound(), UUID.randomUUID(), "품목", null, null, 100,
                new BigDecimal("999999999999900"), BigDecimal.ZERO, new BigDecimal("999999999999900"),
                null, null);

        assertThat(line.getSupplyAmount()).isEqualByComparingTo("999999999999900");
    }

    @Test
    @DisplayName("소수점 표기 형식이 달라도 항등식 값이 같으면 보존한다")
    void acceptsEquivalentBigDecimalScales() {
        SlipLine line = SlipLine.createFromAuthoritativeAmounts(
                newOutbound(), UUID.randomUUID(), "품목", null, null, 1,
                new BigDecimal("1000.00"), new BigDecimal("100.0"), new BigDecimal("1100.000"),
                null, null);

        assertThat(line.getLineTotal()).isEqualByComparingTo("1000.00");
        assertThat(line.getVatAmount()).isEqualByComparingTo("100.0");
    }

    @Test
    @DisplayName("기존 공급단가 팩토리는 기존 전표 lineTotal 의미를 유지한다")
    void keepsLegacySlipLineMeaning() {
        SlipLine line = SlipLine.create(newOutbound(), UUID.randomUUID(), "품목", null, null,
                2, new BigDecimal("1000"), null);

        assertThat(line.getLineTotal()).isEqualByComparingTo("2000");
        assertThat(line.getSupplyAmount()).isEqualByComparingTo("2000");
    }

    @Test
    @DisplayName("P5: 정상 VAT 포함 단가 경로는 공급가액·부가세·단가 계산을 유지한다")
    void keepsNormalVatInclusivePath() {
        SlipLine line = SlipLine.createFromVatInclusive(newOutbound(), UUID.randomUUID(), "품목", null,
                null, 2, new BigDecimal("11000"), null, null);

        assertThat(line.getUnitPrice()).isEqualByComparingTo("10000");
        assertThat(line.getUnitPriceWithVat()).isEqualByComparingTo("11000");
        assertThat(line.getSupplyAmount()).isEqualByComparingTo("20000");
        assertThat(line.getVatAmount()).isEqualByComparingTo("2000");
        assertThat(line.getLineTotal()).isEqualByComparingTo("20000");
    }

    @Test
    @DisplayName("견적과 같은 VAT 포함 단가 110005는 공급가 100005·VAT 10000으로 분리한다")
    void splitsVatInclusivePriceWithQuoteRounding() {
        SlipLine line = SlipLine.createFromVatInclusive(newOutbound(), UUID.randomUUID(), "품목", null,
                null, 1, new BigDecimal("110005"), null, null);

        assertThat(line.getSupplyAmount()).isEqualByComparingTo("100005");
        assertThat(line.getVatAmount()).isEqualByComparingTo("10000");
    }

    @Test
    @DisplayName("공급가액 100005의 부가세는 세금계산서와 같은 원 단위 절사 10000이다")
    void usesCommonVatRounding() {
        SlipLine line = SlipLine.create(newOutbound(), UUID.randomUUID(), "품목", null, null,
                1, new BigDecimal("100005"), null);

        assertThat(line.getVatAmount()).isEqualByComparingTo("10000");
    }

    @Test
    @DisplayName("재수렴 6차(#937) A안: 사용자 입력 단가 경로는 저장 시점에 VAT_INCLUSIVE 를 기록한다")
    void recordsVatInclusiveDomainOnAuthoritativeFactory() {
        // D-1R6 좌표 — 사용자가 단가(VAT포함) 100,000 을 입력하고 "부가세 별도"로 정정한 상태.
        // 저장 상태만 보면 구 BE 오염행(두 컬럼에 같은 VAT 제외 값)과 완전히 같다.
        SlipLine line = SlipLine.createFromAuthoritativeAmounts(
                newOutbound(), UUID.randomUUID(), "품목", "모델", null, 2,
                new BigDecimal("100000"), new BigDecimal("200000"), new BigDecimal("20000"),
                new BigDecimal("220000"), null, null);

        assertThat(line.getUnitPrice()).isEqualByComparingTo("100000");
        assertThat(line.getUnitPriceWithVat()).isEqualByComparingTo("100000");
        // RED(수정 전): null — DB 에 도메인 정보가 없어 표시 계층이 110,000 으로 유도했다.
        assertThat(line.getUnitPriceDomain()).isEqualTo(UnitPriceDomain.VAT_INCLUSIVE);
    }

    @Test
    @DisplayName("재수렴 6차(#937) A안: VAT 포함 팩토리·호환 권위 팩토리도 VAT_INCLUSIVE 를 기록한다")
    void recordsVatInclusiveDomainOnVatInclusiveFactories() {
        SlipLine fromVatInclusive = SlipLine.createFromVatInclusive(newOutbound(), UUID.randomUUID(),
                "품목", null, null, 2, new BigDecimal("11000"), null, null);
        assertThat(fromVatInclusive.getUnitPriceDomain()).isEqualTo(UnitPriceDomain.VAT_INCLUSIVE);

        SlipLine compat = SlipLine.createFromAuthoritativeAmounts(newOutbound(), UUID.randomUUID(),
                "품목", null, null, 2, new BigDecimal("200000"), new BigDecimal("20000"),
                new BigDecimal("220000"), null, null);
        assertThat(compat.getUnitPriceDomain()).isEqualTo(UnitPriceDomain.VAT_INCLUSIVE);
    }

    @Test
    @DisplayName("재수렴 6차(#937) A안: 평문 공급단가 팩토리는 SUPPLY 를 기록한다")
    void recordsSupplyDomainOnPlainFactory() {
        SlipLine line = SlipLine.create(newOutbound(), UUID.randomUUID(), "품목", null, null,
                2, new BigDecimal("1000"), null);

        assertThat(line.getUnitPriceDomain()).isEqualTo(UnitPriceDomain.SUPPLY);
    }

    @Test
    @DisplayName("재수렴 6차(#937) A안: 사본은 원본 도메인을 그대로 승계한다 "
            + "(원본이 legacy 면 사본도 legacy — 사본이 원본과 다른 단가를 보이면 안 된다)")
    void copyInheritsUnitPriceDomain() {
        Slip target = newOutbound();
        SlipLine source = SlipLine.createFromAuthoritativeAmounts(
                newOutbound(), UUID.randomUUID(), "품목", "모델", null, 2,
                new BigDecimal("100000"), new BigDecimal("200000"), new BigDecimal("20000"),
                new BigDecimal("220000"), null, null);

        SlipLine copy = SlipLine.copyOf(target, source);

        assertThat(copy.getUnitPriceDomain()).isEqualTo(UnitPriceDomain.VAT_INCLUSIVE);
        assertThat(copy.getUnitPriceWithVat()).isEqualByComparingTo("100000");
    }

    private Slip newOutbound() {
        return Slip.createOutbound("2026/07/22-1", LocalDate.of(2026, 7, 22), 1,
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "거래처",
                DeliveryTag.DAY, null, "test-user");
    }
}
