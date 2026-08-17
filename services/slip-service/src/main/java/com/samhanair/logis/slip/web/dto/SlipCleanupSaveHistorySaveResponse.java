package com.samhanair.logis.slip.web.dto;

import java.time.LocalDateTime;

/**
 * 전표정리 저장내역 생성 응답 DTO.
 *
 * @param savedAt 저장시각
 */
public record SlipCleanupSaveHistorySaveResponse(LocalDateTime savedAt) {
}
