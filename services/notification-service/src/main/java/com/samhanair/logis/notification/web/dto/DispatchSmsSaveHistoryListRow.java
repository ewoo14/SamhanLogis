package com.samhanair.logis.notification.web.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.samhanair.logis.notification.domain.DispatchSmsProgramType;
import com.samhanair.logis.notification.domain.DispatchSmsSaveHistory;
import com.samhanair.logis.notification.domain.DispatchSmsSaveMode;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 배차문자 저장내역 목록 row DTO.
 *
 * @param id 저장내역 ID. 화면 비노출, 상세 조회 전용
 * @param programType 프로그램 구분
 * @param saveMode 저장 방식
 * @param topic 저장주제
 * @param createdAt 작성시각
 * @param createdBy 작성자 식별자. 프런트에서 mask 처리
 * @param requestParams 요청 조건 JSON
 * @param rowCount 화면 요약 row 수
 */
public record DispatchSmsSaveHistoryListRow(
        UUID id,
        DispatchSmsProgramType programType,
        DispatchSmsSaveMode saveMode,
        String topic,
        LocalDateTime createdAt,
        String createdBy,
        JsonNode requestParams,
        int rowCount) {

    /** entity 를 payload 미포함 목록 row 로 변환한다. */
    public static DispatchSmsSaveHistoryListRow from(DispatchSmsSaveHistory history) {
        return new DispatchSmsSaveHistoryListRow(
                history.getId(),
                history.getProgramType(),
                history.getSaveMode(),
                history.getTopic(),
                history.getCreatedAt(),
                history.getCreatedBy(),
                history.getRequestParams(),
                extractRowCount(history));
    }

    private static int extractRowCount(DispatchSmsSaveHistory history) {
        JsonNode requestParams = history.getRequestParams();
        if (requestParams != null && requestParams.has("rowCount")) {
            return requestParams.path("rowCount").asInt(0);
        }
        JsonNode responsePayload = history.getResponsePayload();
        if (responsePayload != null && responsePayload.has("totalMessages")) {
            return responsePayload.path("totalMessages").asInt(0);
        }
        if (responsePayload != null && responsePayload.has("sent")) {
            return responsePayload.path("sent").asInt(0)
                    + responsePayload.path("failed").asInt(0)
                    + responsePayload.path("blocked").asInt(0);
        }
        return 0;
    }
}
