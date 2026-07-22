package com.samhanair.logis.slip.estimate.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * MED-4(#824 R2) — SlipLine 과 동일 구조/동일 결함군 sweep (#824 R1 MED-4 fix 시
 * "SlipLine.validateAmount 동일 sweep" 주석으로 이미 짝을 이룬 클래스).
 *
 * <p>EstimateLine 은 SlipLine 보다 한 겹 더 취약했다 — {@code create()} 평문 경로는
 * {@code unitPriceWithVat} 자체를 계산하지 않고(legacy nullable 컬럼, null 유지) 오직
 * {@code supplyAmount}/{@code vatAmount}/{@code lineTotal} 만 재계산하므로, R1 이전에는
 * 이 세 필드에 대한 자릿수 가드가 {@code create()}/{@code createFromVatInclusive()} 양쪽
 * 모두에 전혀 없었다(경로 누락). {@code createFromAuthoritativeAmounts} 만 가드가 있었고
 * 그마저 임계값이 SlipLine 과 같은 결함(narrow/wide 컬럼 미구분, 정수부 15 고정)이었다.
 */
@DisplayName("견적 라인 저장 가능 금액 범위 — MED-4 R2 경로/임계값 sweep")
class EstimateLineAmountOverflowTest {

    @Test
    @DisplayName("평문 create() 경로도 거대 단가(공급가액 18자리 파생)를 저장 전에 거부해야 한다")
    void plainCreate_hugeUnitPrice_rejectedBecauseDerivedSupplyOverflows() {
        assertThatThrownBy(() -> EstimateLine.create(newEstimate(), 1, UUID.randomUUID(), "품목",
                "모델", null, 1, new BigDecimal("100000000000000000"), null))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_INPUT);
    }

    @Test
    @DisplayName("VAT 포함 단가 입력 경로(createFromVatInclusive)도 거대 입력을 저장 전에 거부해야 한다")
    void createFromVatInclusive_hugeUnitPrice_rejected() {
        assertThatThrownBy(() -> EstimateLine.createFromVatInclusive(newEstimate(), 1, UUID.randomUUID(),
                "품목", "모델", null, 1, new BigDecimal("100000000000000000"), null))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_INPUT);
    }

    @Test
    @DisplayName("정상 업무 범위(수십억)는 계속 통과한다 — 과도한 축소 회귀 방지")
    void normalBusinessRangeUnitPrice_stillAccepted() {
        EstimateLine line = EstimateLine.create(newEstimate(), 1, UUID.randomUUID(), "품목",
                "모델", null, 3, new BigDecimal("2500000000"), null);
        assertThat(line.getSupplyAmount()).isEqualByComparingTo("7500000000");
    }

    @Test
    @DisplayName("MED-4 R2: quantity=1 · 15자리 합계(T)는 파생 VAT포함단가(narrow 컬럼)가 넘쳐 "
            + "createFromAuthoritativeAmounts 에서도 거부돼야 한다 — R1 임계값(15 고정)의 사각지대")
    void createFromAuthoritativeAmounts_fifteenDigitTotalAtQuantityOne_rejected() {
        assertThatThrownBy(() -> EstimateLine.createFromAuthoritativeAmounts(
                newEstimate(), 1, UUID.randomUUID(), "품목", "모델", null, 1,
                new BigDecimal("999999999999999"), BigDecimal.ZERO, new BigDecimal("999999999999999"),
                null))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_INPUT);
    }

    @Test
    @DisplayName("MED-4 R2: 수량이 커서 파생 단가가 narrow 컬럼에 들어가면 15자리 합계(T)도 허용한다")
    void createFromAuthoritativeAmounts_fifteenDigitTotalWithLargeQuantity_accepted() {
        EstimateLine line = EstimateLine.createFromAuthoritativeAmounts(
                newEstimate(), 1, UUID.randomUUID(), "품목", "모델", null, 100,
                new BigDecimal("999999999999900"), BigDecimal.ZERO, new BigDecimal("999999999999900"),
                null);
        assertThat(line.getLineTotal()).isEqualByComparingTo("999999999999900");
    }

    @Test
    @DisplayName("MED-4 R2: changeUnitPrice 로 편집해도 파생값 overflow 는 거부돼야 한다")
    void changeUnitPrice_toOverflowingValue_rejected() {
        EstimateLine line = EstimateLine.create(newEstimate(), 1, UUID.randomUUID(), "품목",
                "모델", null, 1, new BigDecimal("1000"), null);

        assertThatThrownBy(() -> line.changeUnitPrice(new BigDecimal("100000000000000000")))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_INPUT);
    }

    private Estimate newEstimate() {
        return Estimate.create("Q-20260722-9", LocalDate.of(2026, 7, 22), 1,
                UUID.randomUUID(), "거래처", null, null, null, null, "test-user");
    }
}
