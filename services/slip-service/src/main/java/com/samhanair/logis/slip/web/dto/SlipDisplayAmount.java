package com.samhanair.logis.slip.web.dto;

import com.samhanair.logis.slip.domain.SlipLine;
import java.math.BigDecimal;
import java.util.List;

/**
 * 사용자에게 표시하는 전표 금액 계산기.
 *
 * <p>표시용 금액은 공급가액과 부가세의 합계(VAT 포함)다. V59 이전 legacy 행도
 * {@code unitPriceDomain}을 근거로 추측하지 않고 저장된 공급가액·부가세를 우선 사용한다.
 * 회계 projection의 공급가액/부가세 분리 값에는 사용하지 않는다.
 */
public final class SlipDisplayAmount {

    private SlipDisplayAmount() {}

    /**
     * 라인 1건의 표시 금액을 계산한다.
     *
     * @param line 전표 라인
     * @return VAT 포함 금액
     */
    public static BigDecimal vatInclusive(SlipLine line) {
        if (line.getSupplyAmount() != null) {
            return line.getSupplyAmount().add(nullToZero(line.getVatAmount()));
        }
        // V12 이전 legacy 행은 supplyAmount가 null일 수 있다. 이때도 저장된 lineTotal을
        // 우선 사용해야 하며, 단가×수량으로 되짚으면 저장값과 다른 표시 drift가 발생한다.
        if (line.getLineTotal() == null) {
            if (line.getUnitPriceWithVat() != null) {
                return line.getUnitPriceWithVat().multiply(BigDecimal.valueOf(line.getQuantity()));
            }
            return BigDecimal.ZERO;
        }
        return line.getLineTotal().add(nullToZero(line.getVatAmount()));
    }

    /**
     * 라인들의 표시 금액 소계를 계산한다.
     *
     * @param lines 전표 라인 목록
     * @return VAT 포함 소계
     */
    public static BigDecimal vatInclusiveTotal(List<SlipLine> lines) {
        return lines.stream().map(SlipDisplayAmount::vatInclusive)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private static BigDecimal nullToZero(BigDecimal amount) {
        return amount == null ? BigDecimal.ZERO : amount;
    }
}
