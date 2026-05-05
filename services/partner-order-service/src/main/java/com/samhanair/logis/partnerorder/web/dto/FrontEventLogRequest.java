package com.samhanair.logis.partnerorder.web.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 프론트 액션 로그 요청 (legacy logFrontEvent). silent fail 가드 — 어떤 결과든 200.
 *
 * @param action 짧은 라벨 (예: '로그인 시도', '주문 전송')
 * @param detail JSON 또는 자유 텍스트
 */
public record FrontEventLogRequest(
        @NotBlank String action,
        String detail) {
}
