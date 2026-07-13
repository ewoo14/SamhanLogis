package com.samhanair.logis.product.web.dto;

import java.util.UUID;

/**
 * 회계 라벨 벌크 조회 단건 결과 — {@link LookupByLabelBulkRequest} 응답 Map 의 value.
 *
 * <p>단건 {@code lookup-by-label} 은 미매칭/다의성을 404/409 HTTP status 로 표현하지만, 벌크는
 * 라벨 여러 건을 한 응답에 담아야 하므로 사유를 {@code status} 문자열로 보존한다. accounting-service
 * {@code ProductLabelMatch.Status} 열거값 이름과 문자열로 정합한다 — MSA 경계상 enum 타입 자체를
 * 공유하지 않고 계약(문자열)만 공유하는 느슨 결합이다.
 *
 * @param status {@link #MATCHED}/{@link #NOT_FOUND}/{@link #AMBIGUOUS} 중 하나
 * @param productId status=MATCHED 일 때만 non-null
 * @param modelCode status=MATCHED 일 때 채워진다. 레거시 제품(모델코드 미부여)은 매칭되어도 null 가능 —
 *                  이 null 은 응답 포맷 오류가 아니라 정상 상태다
 */
public record LabelResolutionResult(String status, UUID productId, String modelCode) {

    /** 정확히 1건 매칭. */
    public static final String MATCHED = "MATCHED";
    /** 매칭 제품이 없음 (단건 조회의 404 에 대응). */
    public static final String NOT_FOUND = "NOT_FOUND";
    /** LIKE 후보 2건 이상으로 다의성 (단건 조회의 409 에 대응). */
    public static final String AMBIGUOUS = "AMBIGUOUS";
}
