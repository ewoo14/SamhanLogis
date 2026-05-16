package com.samhanair.logis.slip.web.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.samhanair.logis.slip.domain.SlipCleanupProgramType;
import com.samhanair.logis.slip.domain.SlipCleanupSaveHistory;
import com.samhanair.logis.slip.domain.SlipCleanupSaveMode;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 전표정리 저장내역 상세 응답 DTO.
 *
 * @param id 저장내역 ID
 * @param programType 프로그램 구분
 * @param saveMode 저장 방식
 * @param topic 저장주제
 * @param createdAt 작성시각
 * @param createdBy 작성자 user-id
 * @param requestParams 조회 조건과 요약 JSON
 * @param responsePayload 복원용 결과 JSON
 */
public record SlipCleanupSaveHistoryDetailResponse(
        UUID id,
        SlipCleanupProgramType programType,
        SlipCleanupSaveMode saveMode,
        String topic,
        LocalDateTime createdAt,
        String createdBy,
        JsonNode requestParams,
        JsonNode responsePayload) {

    /** entity 를 상세 응답으로 변환한다. */
    public static SlipCleanupSaveHistoryDetailResponse from(SlipCleanupSaveHistory history) {
        return new SlipCleanupSaveHistoryDetailResponse(
                history.getId(),
                history.getProgramType(),
                history.getSaveMode(),
                history.getTopic(),
                history.getCreatedAt(),
                history.getCreatedBy(),
                history.getRequestParams(),
                history.getResponsePayload());
    }
}
