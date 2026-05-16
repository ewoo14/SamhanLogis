package com.samhanair.logis.arologis.web.dto;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 배차 저장내역 생성 응답 DTO.
 *
 * @param id 생성된 저장내역 ID
 * @param savedAt 저장시각
 */
public record DispatchSaveHistorySaveResponse(UUID id, LocalDateTime savedAt) {
}
