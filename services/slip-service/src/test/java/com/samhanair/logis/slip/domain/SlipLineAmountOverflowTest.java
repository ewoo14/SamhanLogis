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

/**
 * MED-4(#824 R2) — 실서버 500 재현 sweep (도메인 레벨).
 *
 * <p>R1 은 {@code SlipLine.validateAmount} 를 {@code createFromAuthoritativeAmounts} 에만
 * 연결했고 임계값도 정수부 15자리(모든 컬럼 공통)로 두었다. 그러나:
 * <ul>
 *   <li><b>경로 누락</b> — 실사용 기본 경로인 {@code create()}(VAT 미포함 단가)와
 *       {@code createFromVatInclusive()}(VAT 포함 단가, 2026-06-09 라인단위 eCount 전환 후
 *       기본값) 는 자릿수 가드를 전혀 호출하지 않는다.</li>
 *   <li><b>임계값 불일치</b> — {@code unit_price}/{@code unit_price_with_vat}/{@code vat_amount}
 *       는 실제로 {@code NUMERIC(15,2)}(정수부 13자리 한계)이고 {@code line_total}/
 *       {@code supply_amount} 만 {@code NUMERIC(17,2)}(정수부 15자리, 수량 곱셈 마진 — V1
 *       컨벤션 주석)이다. R1 의 단일 15 임계값은 narrow 컬럼(13자리 한계)에 14~15자리를
 *       통과시켰다 — "가드 통과 후 DB 오버플로".</li>
 * </ul>
 * 실 요청 경로 증거는 {@code SlipLineAmountOverflowControllerIT}(실 Postgres IT) 가 맡는다 —
 * 이 클래스는 도메인 로직 자체의 sweep 이다.
 */
@DisplayName("전표 라인 저장 가능 금액 범위 — MED-4 R2 경로/임계값 sweep")
class SlipLineAmountOverflowTest {

    @Test
    @DisplayName("PM 실측 재현: 13자리 단가는 그 자체론 유효하나 VAT 포함 단가(x1.1)가 14자리로 "
            + "넘쳐 평문 create() 경로에서 거부돼야 한다")
    void plainCreate_thirteenDigitUnitPrice_rejectedBecauseDerivedVatInclusiveOverflows() {
        assertThatThrownBy(() -> SlipLine.create(newOutbound(), UUID.randomUUID(), "품목", null, null,
                1, new BigDecimal("9999999999999"), null))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_INPUT);
    }

    @Test
    @DisplayName("VAT 포함 단가 입력 경로(createFromVatInclusive)도 거대 입력을 저장 전에 거부해야 한다")
    void createFromVatInclusive_hugeUnitPrice_rejected() {
        assertThatThrownBy(() -> SlipLine.createFromVatInclusive(newOutbound(), UUID.randomUUID(),
                "품목", null, null, 1, new BigDecimal("100000000000000000"), null, null))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_INPUT);
    }

    @Test
    @DisplayName("13자리 단가라도 x1.1 파생값이 13자리 안에 들어가면 계속 허용한다 — 경계 회귀 방지")
    void plainCreate_thirteenDigitUnitPriceWithinDerivedBound_stillAccepted() {
        // 9,000,000,000,000 (13자리) x 1.1 = 9,900,000,000,000.00 (13자리) — narrow 컬럼 경계 안.
        SlipLine line = SlipLine.create(newOutbound(), UUID.randomUUID(), "품목", null, null,
                1, new BigDecimal("9000000000000"), null);
        assertThat(line.getUnitPrice()).isEqualByComparingTo("9000000000000");
        assertThat(line.getUnitPriceWithVat()).isEqualByComparingTo("9900000000000.00");
    }

    @Test
    @DisplayName("정상 업무 범위(수십억)는 계속 통과한다 — 과도한 축소 회귀 방지")
    void normalBusinessRangeUnitPrice_stillAccepted() {
        SlipLine line = SlipLine.create(newOutbound(), UUID.randomUUID(), "품목", null, null,
                3, new BigDecimal("2500000000"), null);
        assertThat(line.getLineTotal()).isEqualByComparingTo("7500000000");
    }

    @Test
    @DisplayName("전표 복사도 원본의 categoryKey를 보존한다")
    void copyOf_preservesCategoryKey() {
        Slip sourceSlip = newOutbound();
        SlipLine source = SlipLine.create(sourceSlip, UUID.randomUUID(), "품목", "MODEL",
                null, 1, new BigDecimal("1000"), null, UUID.randomUUID(), "singleSets");
        Slip target = newOutbound();

        SlipLine copied = SlipLine.copyOf(target, source);

        assertThat(copied.getCategoryKey()).isEqualTo("singleSets");
    }

    @Test
    @DisplayName("MED-4 R2: quantity=1 · 15자리 공급가액은 파생 단가(narrow 컬럼)가 넘쳐 "
            + "createFromAuthoritativeAmounts 에서도 거부돼야 한다 — R1 임계값(15 고정)의 사각지대")
    void createFromAuthoritativeAmounts_fifteenDigitSupplyAtQuantityOne_rejected() {
        assertThatThrownBy(() -> SlipLine.createFromAuthoritativeAmounts(
                newOutbound(), UUID.randomUUID(), "품목", null, null, 1,
                new BigDecimal("999999999999999"), BigDecimal.ZERO, new BigDecimal("999999999999999"),
                null, null))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_INPUT);
    }

    @Test
    @DisplayName("MED-4 R2: 수량이 커서 파생 단가가 narrow 컬럼에 들어가면 15자리 공급가액도 "
            + "허용한다 — wide 컬럼(line_total/supply_amount) 자체 한계는 15자리가 맞다")
    void createFromAuthoritativeAmounts_fifteenDigitSupplyWithLargeQuantity_accepted() {
        SlipLine line = SlipLine.createFromAuthoritativeAmounts(
                newOutbound(), UUID.randomUUID(), "품목", null, null, 100,
                new BigDecimal("999999999999900"), BigDecimal.ZERO, new BigDecimal("999999999999900"),
                null, null);
        assertThat(line.getSupplyAmount()).isEqualByComparingTo("999999999999900");
    }

    @Test
    @DisplayName("MED-4 R2: changeUnitPrice 로 편집해도 파생 VAT포함단가 overflow 는 거부돼야 한다")
    void changeUnitPrice_toOverflowingValue_rejected() {
        SlipLine line = SlipLine.create(newOutbound(), UUID.randomUUID(), "품목", null, null,
                1, new BigDecimal("1000"), null);

        assertThatThrownBy(() -> line.changeUnitPrice(new BigDecimal("9999999999999")))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_INPUT);
    }

    private Slip newOutbound() {
        return Slip.createOutbound("2026/07/22-1", LocalDate.of(2026, 7, 22), 1,
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "거래처",
                DeliveryTag.SALE, null, "test-user");
    }
}
