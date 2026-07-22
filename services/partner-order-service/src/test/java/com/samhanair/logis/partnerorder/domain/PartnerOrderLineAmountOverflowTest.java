package com.samhanair.logis.partnerorder.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * MED-4(#824 R2) — SlipLine/EstimateLine 과 동일 결함군의 주문 측 sweep.
 *
 * <p>{@link PartnerOrderLine} 은 R1 이전 자릿수 가드가 <b>전혀 없었다</b> —
 * {@code requireNonNegative} 는 부호만 검사한다. PRICE/SUPPLY/VAT/TOTAL 네 권위 경로 모두
 * {@code createFromAuthoritativeAmounts} 하나로 수렴하므로 이 한 지점만 고치면 네 경로가
 * 동시에 커버된다.
 *
 * <p>{@code price_vat}/{@code subtotal}/{@code supply_amount}/{@code vat_amount} 는
 * 넷 다 {@code NUMERIC(15,2)}(정수부 13자리 한계) — slip/estimate 와 달리 wide(17,2) 컬럼이
 * 없다(V1 컨벤션 주석: "가격/금액은 NUMERIC(15,2)"). 그래서 quantity 곱셈 여유가 전혀 없고,
 * PRICE 권위 경로는 quantity=2 만 돼도 13자리 단가가 14자리 subtotal 로 넘칠 수 있다.
 */
@DisplayName("주문 라인 저장 가능 금액 범위 — MED-4 R2 경로/임계값 sweep")
class PartnerOrderLineAmountOverflowTest {

    @Test
    @DisplayName("PRICE 권위: 13자리 단가 x 수량 2 는 14자리 subtotal 로 넘쳐 거부돼야 한다")
    void priceAuthority_thirteenDigitPriceTimesTwoQuantity_rejectedBecauseSubtotalOverflows() {
        assertThatThrownBy(() -> PartnerOrderLine.create(
                UUID.randomUUID(), "MODEL-OVERFLOW", "품목", "singleSets", 2,
                new BigDecimal("9999999999999"), null))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_INPUT);
    }

    @Test
    @DisplayName("SUPPLY 권위: 거대 공급가액은 저장 전에 거부돼야 한다")
    void supplyAuthority_hugeSupplyAmount_rejected() {
        assertThatThrownBy(() -> PartnerOrderLine.createFromAuthoritativeAmounts(
                UUID.randomUUID(), "MODEL-OVERFLOW", "품목", "singleSets", 1,
                null, new BigDecimal("100000000000000000"), null, null,
                PartnerOrderLine.AmountAuthority.SUPPLY, null))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_INPUT);
    }

    @Test
    @DisplayName("TOTAL 권위: 거대 합계는 저장 전에 거부돼야 한다")
    void totalAuthority_hugeLineTotal_rejected() {
        assertThatThrownBy(() -> PartnerOrderLine.createFromAuthoritativeAmounts(
                UUID.randomUUID(), "MODEL-OVERFLOW", "품목", "singleSets", 1,
                null, null, null, new BigDecimal("100000000000000000"),
                PartnerOrderLine.AmountAuthority.TOTAL, null))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_INPUT);
    }

    @Test
    @DisplayName("VAT 권위: 거대 공급가액+부가세는 저장 전에 거부돼야 한다")
    void vatAuthority_hugeSupplyAndVat_rejected() {
        assertThatThrownBy(() -> PartnerOrderLine.createFromAuthoritativeAmounts(
                UUID.randomUUID(), "MODEL-OVERFLOW", "품목", "singleSets", 1,
                null, new BigDecimal("90000000000000000"), new BigDecimal("9000000000000000"), null,
                PartnerOrderLine.AmountAuthority.VAT, null))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_INPUT);
    }

    @Test
    @DisplayName("정상 업무 범위(수십억)는 계속 통과한다 — 과도한 축소 회귀 방지")
    void normalBusinessRangePrice_stillAccepted() {
        PartnerOrderLine line = PartnerOrderLine.create(
                UUID.randomUUID(), "MODEL-NORMAL", "품목", "singleSets", 3,
                new BigDecimal("2500000000"), null);
        assertThat(line.getSubtotal()).isEqualByComparingTo("7500000000");
    }

    @Test
    @DisplayName("13자리 단가라도 수량 1 이면(subtotal 도 13자리) 계속 허용한다 — 경계 회귀 방지")
    void thirteenDigitPrice_quantityOne_stillAccepted() {
        PartnerOrderLine line = PartnerOrderLine.create(
                UUID.randomUUID(), "MODEL-BOUNDARY", "품목", "singleSets", 1,
                new BigDecimal("9000000000000"), null);
        assertThat(line.getPriceVat()).isEqualByComparingTo("9000000000000");
    }
}
