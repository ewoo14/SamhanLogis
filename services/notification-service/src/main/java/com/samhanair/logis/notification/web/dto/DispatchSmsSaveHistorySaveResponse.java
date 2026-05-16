package com.samhanair.logis.notification.web.dto;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 배차문자 저장내역 생성 응답.
 *
 * @param id 저장내역 ID. 클라이언트 화면에는 표시하지 않고 상세 조회 path 전용으로 사용
 * @param savedAt 저장 시각
 */
public record DispatchSmsSaveHistorySaveResponse(UUID id, LocalDateTime savedAt) {
}
