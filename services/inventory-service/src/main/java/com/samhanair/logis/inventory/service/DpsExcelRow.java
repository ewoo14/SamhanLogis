package com.samhanair.logis.inventory.service;

import java.math.BigDecimal;
import java.time.LocalDate;

/** DPS 원본 엑셀 한 행. 레거시 호환 필드와 실제 DPS 입고 필드를 함께 보존한다. */
public record DpsExcelRow(
        String deliveryNo,
        String productCode,
        LocalDate inboundDate,
        int quantity,
        String partnerCode,
        String partnerName,
        BigDecimal totalAmount) {

    /** 기존 템플릿 5열 생성 호환용 생성자. */
    public DpsExcelRow(String productCode, LocalDate inboundDate, int quantity,
                       String partnerCode, String partnerName) {
        this(null, productCode, inboundDate, quantity, partnerCode, partnerName, BigDecimal.ZERO);
    }

    /** 실제 DPS 헤더(납품번호·모델·수량·합계)용 생성자. */
    public DpsExcelRow(String deliveryNo, String productCode, int quantity,
                       BigDecimal totalAmount) {
        this(deliveryNo, productCode, null, quantity, null, null, totalAmount);
    }
}
