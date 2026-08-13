package com.samhanair.logis.slip.revertability;

import com.samhanair.logis.slip.domain.SlipStatus;

/** 판정 시점에 읽은 전표·재고·후속 연결 증거. UUID는 이 계약에 포함하지 않는다. */
public record RevertabilityEvidence(
        String slipNo,
        SlipStatus status,
        long inventoryResultCount,
        long sourceJournalCount,
        String activeDispatchGroupNo) { }
