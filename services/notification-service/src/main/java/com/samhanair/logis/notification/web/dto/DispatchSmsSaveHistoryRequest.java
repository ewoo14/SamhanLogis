package com.samhanair.logis.notification.web.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.samhanair.logis.notification.domain.DispatchSmsProgramType;
import com.samhanair.logis.notification.domain.DispatchSmsSaveMode;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 배차문자 저장내역 생성 요청 DTO.
 *
 * @param programType 배차문자 프로그램 구분
 * @param saveMode 자동 최신 저장 또는 명시 저장
 * @param topic 저장주제. MANUAL_NAMED 시 필수
 * @param requestParams 미리보기/발송 조건과 요약 JSON
 * @param responsePayload 실행 탭 복원용 결과 JSON
 */
public record DispatchSmsSaveHistoryRequest(
        @NotNull DispatchSmsProgramType programType,
        @NotNull DispatchSmsSaveMode saveMode,
        @Size(max = 200) String topic,
        @NotNull JsonNode requestParams,
        @NotNull JsonNode responsePayload) {
}
