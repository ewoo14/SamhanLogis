package com.samhanair.logis.notification.dto;

import java.time.LocalDate;

/** 레거시 {@code 배송기사내역 입력}의 업체명·연락처·날짜 입력 한 건. */
public record DispatchDriverContactInput(
        String slipNo,
        String companyName,
        String driverPhone,
        LocalDate date) {
}
