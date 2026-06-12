package com.samhanair.logis.slip.dto.dispatch;

import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

/**
 * 배차 전송 요청 payload.
 *
 * @param groupIds 선택 전송할 차량 그룹 UUID 목록. null 이면 전체 전송.
 */
public record DispatchTaskDispatchRequest(
        @Size(max = 200) List<UUID> groupIds
) {}
