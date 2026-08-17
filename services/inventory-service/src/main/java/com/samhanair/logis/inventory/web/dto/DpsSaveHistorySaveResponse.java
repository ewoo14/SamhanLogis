package com.samhanair.logis.inventory.web.dto;

import java.time.LocalDateTime;

/**
 * DPS 저장내역 생성 응답 DTO.
 *
 * <p>생성된 내부 ID 는 후속 상세 조회 path param 전용이며 화면 표시 식별자로 사용하지 않는다.
 *
 * @param id 생성된 저장내역 ID
 * @param savedAt 저장시각
 */
public record DpsSaveHistorySaveResponse(LocalDateTime savedAt) {
}
