package com.samhanair.logis.arologis.web.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.samhanair.logis.arologis.domain.DispatchProgramType;
import com.samhanair.logis.arologis.domain.DispatchSaveHistory;
import com.samhanair.logis.arologis.domain.DispatchSaveMode;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 배차 저장내역 목록 row DTO.
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
public record DispatchSaveHistoryListRow(
        UUID id,
        DispatchProgramType programType,
        DispatchSaveMode saveMode,
        String topic,
        LocalDateTime createdAt,
        String createdBy,
        JsonNode requestParams,
        int rowCount) {

    /** entity 를 목록 row 로 변환한다. */
    public static DispatchSaveHistoryListRow from(DispatchSaveHistory history) {
        return new DispatchSaveHistoryListRow(
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
        JsonNode responseValue = responsePayload == null ? null : responsePayload.get("rowCount");
        if (responseValue != null && responseValue.canConvertToInt()) {
            return responseValue.asInt();
        }
        JsonNode rows = responsePayload == null ? null : responsePayload.get("rows");
        if (rows != null && rows.isArray()) {
            return rows.size();
        }
        JsonNode entries = responsePayload == null ? null : responsePayload.get("entries");
        if (entries != null && entries.isArray()) {
            return entries.size();
        }
        JsonNode mismatchedRows = responsePayload == null ? null : responsePayload.get("mismatchedRows");
        return mismatchedRows != null && mismatchedRows.isArray() ? mismatchedRows.size() : 0;
    }
}
