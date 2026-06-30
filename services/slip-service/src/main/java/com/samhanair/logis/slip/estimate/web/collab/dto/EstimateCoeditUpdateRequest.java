package com.samhanair.logis.slip.estimate.web.collab.dto;

/** 견적 협업 텍스트 Yjs update relay 요청. update 는 opaque base64 byte 문자열이다. */
public record EstimateCoeditUpdateRequest(String update) {
}
