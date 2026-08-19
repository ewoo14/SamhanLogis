package com.samhanair.logis.inventory.web.dto;

import java.math.BigDecimal;

/**
 * DPS 비교 결과 mismatch 행 1건 — legacy GAS 결과 시트의 한 행에 해당.
 *
 * <p>{@code rowType} 은 legacy 결과 시트의 카테고리 컬럼:
 * <ul>
 *   <li>QUANTITY_MISMATCH — 동일 (납품번호+모델) 매칭 발견했지만 수량 불일치</li>
 *   <li>PARTNER_MISMATCH — 동일 (slip+product) 매칭이지만 거래처 코드 불일치 (SLIP 단위 한정)</li>
 *   <li>DPS_NOT_FOUND — 출고전표에는 있으나 DPS 엑셀에서 매칭 row 미발견</li>
 *   <li>SLIP_NOT_FOUND — DPS 엑셀에는 있으나 출고전표에서 매칭 라인 미발견</li>
 * </ul>
 *
 * <p>UUID 비공개 — slipNo / productCode / partnerCode 비즈니스 식별자만 노출.
 *
 * @param rowType        mismatch 카테고리 ({@link MismatchType})
 * @param slipNo         전표번호 (slip 매칭 가능 시), 없으면 null
 * @param productCode    품번 (가능한 경우 양쪽 동일), 없으면 null
 * @param partnerCode    거래처 코드 (가능한 경우), 없으면 null
 * @param expectedQty    출고전표 합계/단건 수량 (slip-service 기준), 없으면 0
 * @param actualQty      DPS 엑셀 합계/단건 수량 (실제 입고 기록), 없으면 0
 * @param reason         사용자에게 노출할 한국어 사유 문구
 */
public record RowMismatch(
        MismatchType rowType,
        String slipNo,
        String productCode,
        String partnerCode,
        int expectedQty,
        int actualQty,
        BigDecimal expectedAmount,
        BigDecimal actualAmount,
        String reason) {

    public RowMismatch(MismatchType rowType, String slipNo, String productCode,
                       String partnerCode, int expectedQty, int actualQty, String reason) {
        this(rowType, slipNo, productCode, partnerCode, expectedQty, actualQty,
                BigDecimal.ZERO, BigDecimal.ZERO, reason);
    }

    /** mismatch 카테고리 — legacy GAS 결과 시트 카테고리 컬럼과 1:1 매핑. */
    public enum MismatchType {
        /** 수량 불일치 — 매칭 키는 일치하나 expectedQty != actualQty. */
        QUANTITY_MISMATCH,
        /** 수량은 같지만 합계금액이 다른 경우. */
        AMOUNT_MISMATCH,
        /** 거래처 불일치 — slip vs DPS 의 거래처 코드 불일치 (SLIP 단위 한정). */
        PARTNER_MISMATCH,
        /** DPS 미발견 — 출고전표는 있으나 DPS 엑셀에서 매칭 row 없음. */
        DPS_NOT_FOUND,
        /** 출고 미발견 — DPS 엑셀은 있으나 출고전표에서 매칭 라인 없음. */
        SLIP_NOT_FOUND
    }
}
