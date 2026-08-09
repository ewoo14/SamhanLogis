package com.samhanair.logis.inventory.web.dto;

import java.util.UUID;

/** 정방향 재고 호출이 어느 전표 판에서 파생됐는지 전달하는 선택 메타데이터. */
public record SourceOperationContext(UUID sourceOperationId, UUID slipId, Long slipRevision) {
    public UUID operationIdOrGenerate() {
        return sourceOperationId == null ? UUID.randomUUID() : sourceOperationId;
    }
}
