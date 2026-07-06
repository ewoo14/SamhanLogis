package com.samhanair.logis.accounting.web.collab.dto;

/** 입금보고서 헤더 협업 cursor/selection awareness relay 요청. awareness 는 opaque base64 byte 문자열이다. */
public record CashReceiptCoeditAwarenessRequest(String awareness) {
}
