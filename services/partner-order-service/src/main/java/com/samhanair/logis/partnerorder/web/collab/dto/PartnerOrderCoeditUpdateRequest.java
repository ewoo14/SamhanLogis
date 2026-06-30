package com.samhanair.logis.partnerorder.web.collab.dto;

/** 주문 협업 텍스트 Yjs update relay 요청. update 는 opaque base64 byte 문자열이다. */
public record PartnerOrderCoeditUpdateRequest(String update) {
}
