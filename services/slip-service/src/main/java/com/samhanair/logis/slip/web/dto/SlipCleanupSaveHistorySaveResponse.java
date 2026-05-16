package com.samhanair.logis.slip.web.dto;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 전표정리 저장내역 생성 응답 DTO.
 *
 * @param id 생성된 저장내역 ID
 * @param savedAt 저장시각
 */
public record SlipCleanupSaveHistorySaveResponse(UUID id, LocalDateTime savedAt) {
}
