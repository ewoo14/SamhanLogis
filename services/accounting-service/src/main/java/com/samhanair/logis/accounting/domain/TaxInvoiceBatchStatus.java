package com.samhanair.logis.accounting.domain;

/**
 * 세금계산서 일괄발행 배치 상태.
 *
 * <pre>
 *   DRAFT → COMPLETED → DOWNLOADED
 * </pre>
 *
 * <ul>
 *   <li>{@link #DRAFT} — 미리보기 생성 직후. 아직 .xlsx 다운로드 전.</li>
 *   <li>{@link #COMPLETED} — 데이터 확정 및 저장 완료. 다운로드 가능.</li>
 *   <li>{@link #DOWNLOADED} — .xlsx 파일 최소 1회 다운로드 완료.</li>
 * </ul>
 */
public enum TaxInvoiceBatchStatus {
    /** 미리보기 생성 직후 임시 상태. */
    DRAFT,
    /** 저장 완료 — 홈택스 업로드 대기. */
    COMPLETED,
    /** 다운로드 완료 — 홈택스 업로드 처리됨. */
    DOWNLOADED
}
