package com.samhanair.logis.notification.web.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.samhanair.logis.notification.domain.DispatchSmsSaveHistory;

/**
 * 배차문자 저장내역 상세 DTO.
 *
 * @param responsePayload 미리보기 복원 또는 발송 감사 확인용 payload
 */
public record DispatchSmsSaveHistoryDetailResponse(
        java.util.UUID id,
        com.samhanair.logis.notification.domain.DispatchSmsProgramType programType,
        com.samhanair.logis.notification.domain.DispatchSmsSaveMode saveMode,
        String topic,
        java.time.LocalDateTime createdAt,
        String createdBy,
        JsonNode requestParams,
        int rowCount,
        JsonNode responsePayload) {

    /** entity 를 상세 복원 응답으로 변환한다. */
    public static DispatchSmsSaveHistoryDetailResponse from(DispatchSmsSaveHistory history) {
        DispatchSmsSaveHistoryListRow row = DispatchSmsSaveHistoryListRow.from(history);
        return new DispatchSmsSaveHistoryDetailResponse(
                row.id(),
                row.programType(),
                row.saveMode(),
                row.topic(),
                row.createdAt(),
                row.createdBy(),
                row.requestParams(),
                row.rowCount(),
                history.getResponsePayload());
    }
}
