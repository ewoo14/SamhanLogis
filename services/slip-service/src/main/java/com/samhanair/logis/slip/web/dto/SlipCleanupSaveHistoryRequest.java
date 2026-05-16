package com.samhanair.logis.slip.web.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.samhanair.logis.slip.domain.SlipCleanupProgramType;
import com.samhanair.logis.slip.domain.SlipCleanupSaveMode;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 전표정리 저장내역 생성 요청 DTO.
 *
 * @param programType 전표정리 프로그램 구분
 * @param saveMode 자동 최신 저장 또는 명시 저장
 * @param topic 저장주제. 명시 저장 시 필수
 * @param requestParams 조회 조건과 요약 JSON
 * @param responsePayload 복원용 결과 JSON
 */
public record SlipCleanupSaveHistoryRequest(
        @NotNull SlipCleanupProgramType programType,
        @NotNull SlipCleanupSaveMode saveMode,
        @Size(max = 200) String topic,
        @NotNull JsonNode requestParams,
        @NotNull JsonNode responsePayload) {
}
