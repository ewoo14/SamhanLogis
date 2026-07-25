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
    @DisplayName("D-3: 권위 금액을 편집해도 요청 단가와 VAT 포함 단가를 그대로 보존한다")
    void preservesRequestedUnitPriceForAuthoritativeAmounts() {
        SlipLine line = SlipLine.createFromAuthoritativeAmounts(
                newOutbound(), UUID.randomUUID(), "품목", "모델", null, 2,
                new BigDecimal("11000"), new BigDecimal("50000"), new BigDecimal("2000"),
                new BigDecimal("52000"), null, null);

        assertThat(line.getUnitPrice()).isEqualByComparingTo("11000");
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
    @DisplayName("공급가액 100005의 부가세는 세금계산서와 같은 원 단위 절사 10000이다")
    void usesCommonVatRounding() {
        SlipLine line = SlipLine.create(newOutbound(), UUID.randomUUID(), "품목", null, null,
                1, new BigDecimal("100005"), null);

        assertThat(line.getVatAmount()).isEqualByComparingTo("10000");
    }

    private Slip newOutbound() {
        return Slip.createOutbound("2026/07/22-1", LocalDate.of(2026, 7, 22), 1,
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "거래처",
                DeliveryTag.DAY, null, "test-user");
    }
}
