package com.samhanair.logis.accounting.domain;

/**
 * 세금계산서 상태 (P0-4 #3).
 *
 * <pre>
 *   DRAFT → ISSUED → CANCELLED
 *   MIGRATED
 * </pre>
 *
 * <ul>
 *   <li>{@link #DRAFT} — 작성중. 라인/금액 수정 가능. tax_invoice_no 미부여.</li>
 *   <li>{@link #ISSUED} — 발행 완료. tax_invoice_no 채번 + 자동 분개 (1089/2559/4019).
 *       매뉴얼 §1-4 발행 후 자동 분개 패턴.</li>
 *   <li>{@link #CANCELLED} — 취소 처리. 자동 역분개 생성 + cancelled_at/by 기록.
 *       원분개는 REVERSED, 신규 역분개는 POSTED 로 함께 보존.</li>
 * </ul>
 */
public enum TaxInvoiceStatus {
    /** 작성 중 — 수정/삭제 가능, 발행번호 미부여. */
    DRAFT("임시저장"),

    /** 발행 완료 — 수정 불가, 분개 자동 생성, 발행번호 부여. */
    ISSUED("발행"),

    /** 취소 — 역분개 자동, 발행번호는 보존 (감사 추적). */
    CANCELLED("취소"),

    /** MIG-4 이카운트 raw 에서 이관된 과거 세금계산서. */
    MIGRATED("이관");

    private final String displayName;

    TaxInvoiceStatus(String displayName) {
        this.displayName = displayName;
    }

    /**
     * 사용자 노출 메시지에 사용하는 한국어 상태 라벨.
     *
     * @return 한국어 상태 표시명
     */
    public String getDisplayName() {
        return displayName;
    }
}
