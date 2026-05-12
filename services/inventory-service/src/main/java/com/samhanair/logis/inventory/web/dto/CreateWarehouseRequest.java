package com.samhanair.logis.inventory.web.dto;

import com.samhanair.logis.inventory.domain.WarehouseType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/**
 * 창고 신규 등록 요청. {@code displayOrder} 기본 0.
 *
 * <p>1a (Backlog) — {@code code} 는 optional. null 또는 빈 문자열로 보내면 backend 가
 * `WH-XXXXXX` 패턴(0/1/O/I/L 제외 6자 alphanumeric)으로 자동 생성한다. 명시적으로 채워서
 * 보내면 그 값을 사용 (legacy 호환). 자동 생성 충돌 시 최대 5회 재시도.
 */
public record CreateWarehouseRequest(
        @Size(max = 50) String code,
        @NotBlank @Size(max = 100) String name,
        @NotNull WarehouseType type,
        @Size(max = 255) String address,
        @PositiveOrZero Integer displayOrder,
        @Size(max = 500) String description) {
}
