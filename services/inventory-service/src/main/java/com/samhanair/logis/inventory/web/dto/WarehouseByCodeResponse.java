package com.samhanair.logis.inventory.web.dto;

import java.util.UUID;

/**
 * 창고 코드 → UUID 역조회 응답.
 *
 * <p>partner-order-service 등 내부 서비스가 warehouseCode 를 warehouseId(UUID)로
 * 변환할 때 사용한다. UUID 비공개 가드 적용 대상 아님 — X-Internal-Token 인증 경로 전용.
 *
 * @param warehouseId 창고 UUID
 * @param code        창고 코드 (최대 50자)
 * @param name        창고 이름 (최대 100자)
 */
public record WarehouseByCodeResponse(UUID warehouseId, String code, String name) {
}
