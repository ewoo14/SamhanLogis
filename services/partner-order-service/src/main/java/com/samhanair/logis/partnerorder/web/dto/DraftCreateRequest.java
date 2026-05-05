package com.samhanair.logis.partnerorder.web.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 임시저장 생성 요청 (legacy saveOrderSnapshot/saveDraft).
 *
 * @param label 사용자 표시 라벨 (예: '2025/05/05 - 임시저장 1')
 * @param payloadJson legacy snapshot 페이로드 (image base64 포함 가능, JSON 문자열)
 */
public record DraftCreateRequest(
        @NotBlank String label,
        @NotBlank String payloadJson) {
}
