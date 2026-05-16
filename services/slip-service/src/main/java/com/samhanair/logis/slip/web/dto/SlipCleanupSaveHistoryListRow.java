package com.samhanair.logis.slip.web.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.samhanair.logis.slip.domain.SlipCleanupProgramType;
import com.samhanair.logis.slip.domain.SlipCleanupSaveHistory;
import com.samhanair.logis.slip.domain.SlipCleanupSaveMode;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 전표정리 저장내역 목록 row DTO.
 *
 * <p>목록에는 responsePayload 를 포함하지 않는다. UUID 는 상세 조회 path param 전용이다.
 *
 * @param id 저장내역 ID
 * @param programType 프로그램 구분
 * @param saveMode 저장 방식
 * @param topic 저장주제
 * @param createdAt 작성시각
 * @param createdBy 작성자 user-id
 * @param requestParams 조회 조건과 요약 JSON
 * @param rowCount 결과 행 수 요약
 */
public record SlipCleanupSaveHistoryListRow(
        UUID id,
        SlipCleanupProgramType programType,
        SlipCleanupSaveMode saveMode,
        String topic,
        LocalDateTime createdAt,
        String createdBy,
        JsonNode requestParams,
        int rowCount) {

    /** entity 를 목록 row 로 변환한다. */
    public static SlipCleanupSaveHistoryListRow from(SlipCleanupSaveHistory history) {
        return new SlipCleanupSaveHistoryListRow(
                history.getId(),
                history.getProgramType(),
                history.getSaveMode(),
                history.getTopic(),
                history.getCreatedAt(),
                history.getCreatedBy(),
                history.getRequestParams(),
                rowCount(history.getRequestParams(), history.getResponsePayload()));
    }

    private static int rowCount(JsonNode requestParams, JsonNode responsePayload) {
        JsonNode requestValue = requestParams == null ? null : requestParams.get("rowCount");
        if (requestValue != null && requestValue.canConvertToInt()) {
            return requestValue.asInt();
        }
        JsonNode totalSlips = responsePayload == null ? null : responsePayload.get("totalSlips");
        if (totalSlips != null && totalSlips.canConvertToInt()) {
            return totalSlips.asInt();
        }
        JsonNode entries = responsePayload == null ? null : responsePayload.get("entries");
        return entries != null && entries.isArray() ? entries.size() : 0;
    }
}
