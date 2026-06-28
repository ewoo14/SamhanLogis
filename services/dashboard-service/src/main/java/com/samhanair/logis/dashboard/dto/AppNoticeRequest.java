package com.samhanair.logis.dashboard.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDateTime;

/** 팝업공지 등록/수정 요청. */
public record AppNoticeRequest(
        @NotBlank String title,
        boolean isActive,
        @NotNull LocalDateTime startAt,
        @NotNull LocalDateTime endAt,
        int displayOrder) {
}
