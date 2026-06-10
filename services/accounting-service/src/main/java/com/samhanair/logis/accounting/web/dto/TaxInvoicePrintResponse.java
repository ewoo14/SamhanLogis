package com.samhanair.logis.accounting.web.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * 세금계산서 인쇄용 응답 (P0-4).
 *
 * <p>FE 인쇄 페이지가 이 DTO 를 받아 세금계산서 양식으로 렌더링.
 * NTS 전자세금계산서 연계는 Phase 11+1개월 별도 — 본 슬라이스는 인쇄 데이터만.
 *
 * <p>회사 정보 (공급자): (주)삼한공조시스템 — application.yml {@code app.company.*} 에서 주입.
 * 거래처 정보 (공급받는자): TaxInvoice 발행 시점 스냅샷.
 *
 * <p>한글 금액 변환: {@code totalAmountKorean} — 예: "일금삼백오만원정".
 */
public record TaxInvoicePrintResponse(

        /* ── 공급자 (우리 회사) 정보 ─────────────────────────────── */

        /** 회사명 — (주)삼한공조시스템. */
        String supplierName,

        /**
         * 사업자등록번호 — DB {@code business_number} 컬럼 raw 10자리 숫자 (예: 2148720659).
         * dash 포함 형식 아님. FE 에서 표시 형식 변환 시 {@code formatBizNo} 헬퍼 사용.
         */
        String supplierBusinessNumber,

        /** 대표자. */
        String supplierCeo,

        /** 주소. */
        String supplierAddress,

        /** 업태. */
        String supplierBusinessType,

        /** 종목. */
        String supplierBusinessItem,

        /* ── 공급받는자 (거래처) 정보 ────────────────────────────── */

        /** 거래처 상호 (snapshot). */
        String recipientName,

        /** 사업자등록번호 (snapshot). */
        String recipientBusinessNumber,

        /** 거래처 주소 (snapshot). */
        String recipientAddress,

        /* ── 세금계산서 헤더 ──────────────────────────────────────── */

        /** 세금계산서 발행번호 ({@code YYYYMM-NNNN}). */
        String invoiceNo,

        /** 발행일자 (공급일자). */
        LocalDate issueDate,

        /* ── 라인 목록 ───────────────────────────────────────────── */

        /** 품목 라인 목록. */
        List<PrintLine> lines,

        /* ── 합계 ────────────────────────────────────────────────── */

        /** 공급가액 합계. */
        BigDecimal totalSupplyAmount,

        /** 부가세 합계. */
        BigDecimal totalVatAmount,

        /** 합계 = 공급가액 + 부가세. */
        BigDecimal totalAmount,

        /** 합계 한글 금액 — 예: "일금삼백오만원정". */
        String totalAmountKorean

) {

    /**
     * 세금계산서 인쇄용 라인 1건.
     *
     * @param lineNo       순번
     * @param itemName     품목명
     * @param specification 규격
     * @param quantity     수량
     * @param unit         단위
     * @param unitPrice    단가
     * @param supplyAmount 공급가액
     * @param vatAmount    부가세
     */
    public record PrintLine(
            int lineNo,
            String itemName,
            String specification,
            BigDecimal quantity,
            String unit,
            BigDecimal unitPrice,
            BigDecimal supplyAmount,
            BigDecimal vatAmount
    ) {}
}
