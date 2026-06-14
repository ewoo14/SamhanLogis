package com.samhanair.logis.user.web.dto;

import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.UUID;

/**
 * 내부 사용자 표시명 다건 조회 요청.
 *
 * @param userIds 표시명을 조회할 user UUID 목록
 */
public record BulkDisplayNameRequest(
        @NotNull List<UUID> userIds
) {
}
