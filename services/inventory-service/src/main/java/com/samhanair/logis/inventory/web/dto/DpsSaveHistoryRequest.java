package com.samhanair.logis.inventory.web.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.samhanair.logis.inventory.domain.DpsProgramType;
import com.samhanair.logis.inventory.domain.DpsSaveMode;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * DPS 저장내역 생성 요청 DTO.
 *
 * <p>비교 실행 직후 자동 저장 또는 사용자의 명시 저장을 inventory DB 에 기록한다.
 * responsePayload 는 복원에 필요한 전체 결과 JSON 이며 서비스 레이어에서 100KB 제한을 적용한다.
 *
 * @param programType DPS 프로그램 구분
 * @param saveMode 자동 최신 저장 또는 명시 저장
 * @param topic 저장주제. 명시 저장 시 필수, 자동 저장 시 생략하면 {@code 자동저장}
 * @param requestParams 조회 조건과 요약 JSON
 * @param responsePayload 복원용 결과 JSON
 */
public record DpsSaveHistoryRequest(
        @NotNull DpsProgramType programType,
        @NotNull DpsSaveMode saveMode,
        @Size(max = 200) String topic,
        @NotNull JsonNode requestParams,
        @NotNull JsonNode responsePayload) {
}
