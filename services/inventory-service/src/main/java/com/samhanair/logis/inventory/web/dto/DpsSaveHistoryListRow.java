package com.samhanair.logis.inventory.web.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.samhanair.logis.inventory.domain.DpsProgramType;
import com.samhanair.logis.inventory.domain.DpsSaveHistory;
import com.samhanair.logis.inventory.domain.DpsSaveMode;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * DPS 저장내역 목록 row DTO.
 *
 * <p>목록에는 responsePayload 를 포함하지 않는다. 화면은 저장주제, 작성자, 작성시각,
 * mismatch 요약만 표시하고 내부 UUID 는 행 label 또는 data-testid 로 노출하지 않는다.
 *
 * @param id 상세 조회 path param 전용 ID
 * @param programType 프로그램 구분
 * @param saveMode 저장 방식
 * @param topic 저장주제
 * @param createdAt 작성시각
 * @param createdBy 작성자 user-id
 * @param requestParams 조회 조건과 요약 JSON
 * @param mismatchCount mismatch 요약 수
 */
public record DpsSaveHistoryListRow(
        UUID id,
        DpsProgramType programType,
        DpsSaveMode saveMode,
        String topic,
        LocalDateTime createdAt,
        String createdBy,
        JsonNode requestParams,
        int mismatchCount) {

    /** entity 를 목록 row 로 변환한다. */
    public static DpsSaveHistoryListRow from(DpsSaveHistory history) {
        return new DpsSaveHistoryListRow(
                history.getId(),
                history.getProgramType(),
                history.getSaveMode(),
                history.getTopic(),
                history.getCreatedAt(),
                history.getCreatedBy(),
                history.getRequestParams(),
                mismatchCount(history.getRequestParams(), history.getResponsePayload()));
    }

    private static int mismatchCount(JsonNode requestParams, JsonNode responsePayload) {
        JsonNode requestValue = requestParams == null ? null : requestParams.get("mismatchCount");
        if (requestValue != null && requestValue.canConvertToInt()) {
            return requestValue.asInt();
        }
        JsonNode responseValue = responsePayload == null ? null : responsePayload.get("mismatchCount");
        if (responseValue != null && responseValue.canConvertToInt()) {
            return responseValue.asInt();
        }
        JsonNode mismatches = responsePayload == null ? null : responsePayload.get("mismatches");
        return mismatches != null && mismatches.isArray() ? mismatches.size() : 0;
    }
}
