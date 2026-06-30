package com.samhanair.logis.partnerorder.web.collab.dto;

/** 주문 협업 텍스트 awareness relay 요청. awareness 는 opaque base64 byte 문자열이다. */
public record PartnerOrderCoeditAwarenessRequest(String awareness) {
}
