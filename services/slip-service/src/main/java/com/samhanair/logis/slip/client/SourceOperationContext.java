package com.samhanair.logis.slip.client;

import java.util.UUID;

/** inventory-service source journal에 연결할 호출자 선언. */
public record SourceOperationContext(UUID sourceOperationId, UUID slipId, Long slipRevision) {
}
