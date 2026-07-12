package com.samhanair.logis.accounting.client;

import java.util.UUID;

/**
 * 회계 라벨 기반 product-service 매칭 결과.
 *
 * <p>#773 S2 재검증 엔진은 매칭 성공(productId/modelCode) 뿐 아니라 미매칭·다의성 사유도
 * 구분해서 소비해야 하므로, product-service 응답의 200/404/409 를 {@link Status} 로 보존한다.
 * {@code ProductClient.resolveByLabel} 은 이 result 를 항상 non-null 로 반환하며, 매칭 여부는
 * 반드시 {@link #status()} 로 판정한다.
 *
 * <p><b>{@code modelCode} 는 레거시 제품(모델코드 미부여) 매칭 시 null 일 수 있다</b> — 이는
 * S1b 의 존재 이유(모델코드 없는 레거시 제품도 라벨로 매핑) 자체이므로 {@code modelCode} 가
 * null 이라는 사실만으로 오류로 취급해서는 안 된다.
 */
public record ProductLabelMatch(Status status, UUID productId, String modelCode) {

    /** 라벨 매칭 결과 상태 — S2 재검증 엔진이 사유별로 분기하는 데 사용한다. */
    public enum Status {
        /** 정확히 1건 매칭. productId 는 항상 non-null, modelCode 는 레거시 제품이면 null 가능. */
        MATCHED,
        /** product-service 가 404 를 반환 — 매칭 제품이 없음. */
        NOT_FOUND,
        /** product-service 가 409 를 반환 — LIKE 후보 2건 이상으로 다의성. */
        AMBIGUOUS
    }

    /**
     * 매칭 성공 result 를 생성한다.
     *
     * @param productId 매칭된 제품 UUID (필수·non-null)
     * @param modelCode 매칭된 제품 모델코드. 레거시 제품(모델코드 미부여)은 null 허용
     * @return status=MATCHED 인 result
     */
    public static ProductLabelMatch matched(UUID productId, String modelCode) {
        return new ProductLabelMatch(Status.MATCHED, productId, modelCode);
    }

    /**
     * 미매칭(404) result 를 생성한다.
     *
     * @return status=NOT_FOUND 인 result (productId/modelCode 는 null)
     */
    public static ProductLabelMatch notFound() {
        return new ProductLabelMatch(Status.NOT_FOUND, null, null);
    }

    /**
     * 다의성(409) result 를 생성한다.
     *
     * @return status=AMBIGUOUS 인 result (productId/modelCode 는 null)
     */
    public static ProductLabelMatch ambiguous() {
        return new ProductLabelMatch(Status.AMBIGUOUS, null, null);
    }

    /**
     * 매칭 성공 여부를 판정한다. {@code modelCode} null 여부가 아니라 {@link #status()} 로만 판정한다.
     *
     * @return status 가 MATCHED 이면 true
     */
    public boolean isMatched() {
        return status == Status.MATCHED;
    }
}
