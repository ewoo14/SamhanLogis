package com.samhanair.logis.inventory.web.dto;

import java.util.UUID;

/** 내부 서비스 간 eCount 창고 코드 alias 응답. 사용자 화면 계약이 아니다. */
public record EcountWarehouseAliasResponse(
        String ecountCode,
        String ecountName,
        UUID warehouseId) {
}
