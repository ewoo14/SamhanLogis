package com.samhanair.logis.slip.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;

/**
 * 요청 레벨 권위 금액 3값의 all-or-nothing 계약을 검증한다.
 *
 * <p>기존 클라이언트와 미편집 라인은 세 필드를 모두 생략하고 종전 팩토리를 사용한다.
 * 일부만 전달된 요청은 조용히 절반 적용하지 않고 즉시 400으로 거부한다.
 */
public final class AuthoritativeAmountValidator {

    private AuthoritativeAmountValidator() {
    }

    /**
     * 권위 금액 3값의 존재 여부를 검증한다.
     *
     * @return 세 값이 모두 있으면 true, 모두 없으면 false
     * @throws BusinessException 일부 값만 있으면 INVALID_INPUT
     */
    public static boolean isComplete(BigDecimal supplyAmount, BigDecimal vatAmount,
                                     BigDecimal lineTotalWithVat) {
        int present = (supplyAmount == null ? 0 : 1)
                + (vatAmount == null ? 0 : 1)
                + (lineTotalWithVat == null ? 0 : 1);
        if (present != 0 && present != 3) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "공급가액·부가세·합계는 함께 전송해야 합니다");
        }
        return present == 3;
    }
}
