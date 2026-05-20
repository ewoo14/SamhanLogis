package com.samhanair.logis.accounting.web.dto;

/** MIG-10 backfill request. batchSize null/0 이면 service default 를 사용한다. */
public record EcountMig10BackfillRequest(Integer batchSize) {

    public int normalizedBatchSize() {
        return batchSize == null ? 0 : batchSize;
    }
}
