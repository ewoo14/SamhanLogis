package com.samhanair.logis.accounting.domain;

/**
 * 세금계산서 종류 — 매출 / 매입 구분 (P0-1 Slice B 부가세신고서 집계용).
 *
 * <ul>
 *   <li>{@link #SALES} — 매출 세금계산서: 공급자 기준, 매출 VAT (부가세예수금) 발생.</li>
 *   <li>{@link #PURCHASE} — 매입 세금계산서: 공급받는자 기준, 매입 VAT (부가세대급금) 발생.</li>
 * </ul>
 *
 * <p>기존 레코드 기본값: SALES (한국 물류 업체 특성상 매출 세금계산서 중심).
 */
public enum TaxInvoiceType {

    /** 매출 세금계산서 — 우리 회사가 공급자, VAT 납부 의무 발생. */
    SALES,

    /** 매입 세금계산서 — 우리 회사가 공급받는자, VAT 공제 가능. */
    PURCHASE
}
