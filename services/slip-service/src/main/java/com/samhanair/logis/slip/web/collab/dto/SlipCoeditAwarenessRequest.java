package com.samhanair.logis.slip.web.collab.dto;

/** 전표 협업 텍스트 awareness relay 요청. awareness 는 opaque base64 byte 문자열이다. */
public record SlipCoeditAwarenessRequest(String awareness) {
}
