package com.samhanair.logis.slip.estimate.snapshot.web.dto;

import com.samhanair.logis.slip.estimate.snapshot.domain.QuoteSnapshot;
import java.time.format.DateTimeFormatter;

/**
 * 종합견적서 스냅샷 응답 — legacy getQuoteHistory() 결과 항목 정합:
 * <pre>{ id, created, custName, data, image }</pre>
 *
 * <p>웹 프론트(index.ejs)는 목록에서 {@code item.created}(저장일시) 로 표시/필터하고,
 * 복원 시 {@code item.data}(base64 blob) 를 디코드하여 폼 전체를 그대로 재수화한다.
 * 따라서 목록 응답에도 {@code data}/{@code image} 전체를 포함한다(legacy 동작 동일).
 *
 * @param id 스냅샷 UUID 문자열
 * @param created 저장일시 ISO-8601 (legacy created)
 * @param custName 거래처명
 * @param data 작업상태 base64 JSON blob
 * @param image 미리보기 base64 (nullable)
 */
public record QuoteSnapshotResponse(
        String id,
        String created,
        String custName,
        String data,
        String image) {

    /** 목록·복원용 — data/image 포함 전체 응답. */
    public static QuoteSnapshotResponse full(QuoteSnapshot s) {
        return new QuoteSnapshotResponse(
                s.getId().toString(),
                s.getSavedAt().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME),
                s.getCustName(),
                s.getSnapshotData(),
                s.getPreviewImage());
    }

    /** 저장 응답용 — blob 제외 경량(프론트는 성공 여부만 사용). */
    public static QuoteSnapshotResponse meta(QuoteSnapshot s) {
        return new QuoteSnapshotResponse(
                s.getId().toString(),
                s.getSavedAt().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME),
                s.getCustName(),
                null,
                null);
    }
}
