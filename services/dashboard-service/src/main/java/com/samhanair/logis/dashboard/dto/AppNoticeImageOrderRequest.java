package com.samhanair.logis.dashboard.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import java.util.UUID;

/** 팝업공지 이미지 순서 변경 요청. */
public record AppNoticeImageOrderRequest(
        @NotNull UUID id,
        @PositiveOrZero int displayOrder) {
}
