package com.samhanair.logis.accounting.web.dto;

import java.math.BigDecimal;

/**
 * 홈택스 일괄업로드 양식 1행 — GAS HEADER_LIST 59컬럼 매핑.
 *
 * <p>GAS Index.html {@code HEADER_LIST} 순서 그대로 이식.
 * 홈택스 표준 양식 spec (전자(세금)계산서 일괄발행 엑셀 업로드 양식) 기준.
 */
public record HomtaxRow(
        /** col0: 전자(세금)계산서 종류 (01:일반, 02:영세율). 기본값 "01". */
        String invoiceType,
        /** col1: 작성일자 (yyyyMMdd). */
        String writeDate,
        /** col2: 공급자 등록번호 ("-" 없이). 삼한공조시스템 사업자번호 고정. */
        String supplierRegNo,
        /** col3: 공급자 종사업장번호. */
        String supplierSubNo,
        /** col4: 공급자 상호. */
        String supplierName,
        /** col5: 공급자 성명. */
        String supplierCeo,
        /** col6: 공급자 사업장주소. */
        String supplierAddress,
        /** col7: 공급자 업태. */
        String supplierBizType,
        /** col8: 공급자 종목. */
        String supplierBizItem,
        /** col9: 공급자 이메일. */
        String supplierEmail,
        /** col10: 공급받는자 등록번호 ("-" 없이). 거래처코드에서 숫자만 추출. */
        String buyerRegNo,
        /** col11: 공급받는자 종사업장번호. */
        String buyerSubNo,
        /** col12: 공급받는자 상호. */
        String buyerName,
        /** col13: 공급받는자 성명 (대표이사). */
        String buyerCeo,
        /** col14: 공급받는자 사업장주소. */
        String buyerAddress,
        /** col15: 공급받는자 업태. */
        String buyerBizType,
        /** col16: 공급받는자 종목. */
        String buyerBizItem,
        /** col17: 공급받는자 이메일1. */
        String buyerEmail1,
        /** col18: 공급받는자 이메일2. */
        String buyerEmail2,
        /** col19: 공급가액 합계. */
        BigDecimal supplyAmount,
        /** col20: 세액 합계. */
        BigDecimal vatAmount,
        /** col21: 비고 (배송주소). */
        String remark,
        /** col22: 일자1 (2자리, 작성년월 제외). */
        String itemDate1,
        /** col23: 품목1. */
        String itemName1,
        /** col24: 규격1. */
        String itemSpec1,
        /** col25: 수량1. */
        BigDecimal itemQty1,
        /** col26: 단가1. */
        BigDecimal itemPrice1,
        /** col27: 공급가액1. */
        BigDecimal itemSupply1,
        /** col28: 세액1. */
        BigDecimal itemVat1,
        /** col29: 품목비고1. */
        String itemRemark1,
        /** col30~37: 품목2 (일자/품목/규격/수량/단가/공급가액/세액/비고). */
        String itemDate2, String itemName2, String itemSpec2,
        BigDecimal itemQty2, BigDecimal itemPrice2, BigDecimal itemSupply2, BigDecimal itemVat2, String itemRemark2,
        /** col38~45: 품목3. */
        String itemDate3, String itemName3, String itemSpec3,
        BigDecimal itemQty3, BigDecimal itemPrice3, BigDecimal itemSupply3, BigDecimal itemVat3, String itemRemark3,
        /** col46~53: 품목4. */
        String itemDate4, String itemName4, String itemSpec4,
        BigDecimal itemQty4, BigDecimal itemPrice4, BigDecimal itemSupply4, BigDecimal itemVat4, String itemRemark4,
        /** col54: 현금. */
        BigDecimal cash,
        /** col55: 수표. */
        BigDecimal check,
        /** col56: 어음. */
        BigDecimal bill,
        /** col57: 외상미수금. */
        BigDecimal credit,
        /** col58: 영수(01),청구(02). 기본값 "02". */
        String receiptType,
        /** 내부용 — 원본 전표번호 (홈택스 양식에는 미포함, col59). */
        String slipNo,
        /** 내부용 — 원본 거래처 코드 (홈택스 양식에는 미포함, 결과표 표시용). */
        String partnerCode
) {
}
