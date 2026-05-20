package com.samhanair.logis.accounting.web.dto;

/** MIG-8 staging transform batch 요청. body 생략 시 기본 500건 처리. */
public record EcountMig8TransformRequest(Integer batchSize) {

    private static final int DEFAULT_BATCH_SIZE = 500;
    private static final int MAX_BATCH_SIZE = 5_000;

    public int normalizedBatchSize() {
        if (batchSize == null) {
            return DEFAULT_BATCH_SIZE;
        }
        if (batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
            throw new IllegalArgumentException("batchSize 는 1 이상 5000 이하만 허용됩니다.");
        }
        return batchSize;
    }
}
