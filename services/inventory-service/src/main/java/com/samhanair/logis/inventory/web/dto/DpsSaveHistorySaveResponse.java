package com.samhanair.logis.inventory.web.dto;

import java.time.LocalDateTime;

/**
 * DPS 저장내역 생성 응답 DTO.
 *
 * <p>생성된 내부 ID 는 응답에 포함하지 않는다. 후속 상세 조회는 목록 응답의 ID를 사용한다.
 *
 * @param savedAt 저장시각
 */
public record DpsSaveHistorySaveResponse(LocalDateTime savedAt) {
}
