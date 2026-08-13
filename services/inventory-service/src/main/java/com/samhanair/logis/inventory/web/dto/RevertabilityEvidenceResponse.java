package com.samhanair.logis.inventory.web.dto;

/** slip-service preflight가 읽는 재고 연결 증거. UUID는 서비스 간 요청에만 쓰고 응답에는 넣지 않는다. */
public record RevertabilityEvidenceResponse(long inventoryResultCount, long sourceJournalCount) { }
