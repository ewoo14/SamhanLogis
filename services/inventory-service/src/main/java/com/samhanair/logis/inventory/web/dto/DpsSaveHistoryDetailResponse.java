package com.samhanair.logis.inventory.web.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.samhanair.logis.inventory.domain.DpsProgramType;
import com.samhanair.logis.inventory.domain.DpsSaveHistory;
import com.samhanair.logis.inventory.domain.DpsSaveMode;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * DPS 저장내역 상세 응답 DTO.
 *
 * <p>실행 탭 복원에 필요한 requestParams 와 responsePayload 를 모두 포함한다.
 * UUID 는 API path param 과 내부 상태 식별에만 사용하고 화면 텍스트에는 노출하지 않는다.
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
public record DpsSaveHistoryDetailResponse(
        UUID id,
        DpsProgramType programType,
        DpsSaveMode saveMode,
        String topic,
        LocalDateTime createdAt,
        String createdBy,
        JsonNode requestParams,
        JsonNode responsePayload) {

    /** entity 를 상세 응답으로 변환한다. */
    public static DpsSaveHistoryDetailResponse from(DpsSaveHistory history) {
        return new DpsSaveHistoryDetailResponse(
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
