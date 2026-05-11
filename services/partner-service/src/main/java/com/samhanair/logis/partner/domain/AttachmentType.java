package com.samhanair.logis.partner.domain;

/**
 * 거래처 첨부 파일 유형.
 *
 * <p>본 enum 은 거래처가 보유하는 사업/회계 관련 문서·이미지의 카테고리를 표현한다.
 * Persistence 는 {@code VARCHAR(30)} + DB CHECK 제약 (V3 migration) 으로 enum 값과 1:1 매핑.
 *
 * <ul>
 *   <li>{@link #BIZ_LICENSE} — 사업자등록증 사본 (이미지/PDF)</li>
 *   <li>{@link #BUSINESS_CARD} — 거래처 담당자 명함 이미지</li>
 *   <li>{@link #TAX_INVOICE} — 세금계산서 사본 (계산서 발행/수취 증빙)</li>
 *   <li>{@link #CONTRACT} — 거래/공급 계약서 PDF</li>
 *   <li>{@link #VISIT_PHOTO} — 영업 방문 사진 (P1 — 영업 직원 거래처 방문 시 현장 촬영)</li>
 *   <li>{@link #OTHER} — 그 외 잡다 문서 (사용자가 분류 미정 시 fallback)</li>
 * </ul>
 *
 * <p>본 enum 은 사용자 화면에서도 그대로 노출되므로 신규 카테고리 추가 시 한국어 label 매핑
 * (FE 측 i18n) 도 반드시 동기화해야 한다.
 */
public enum AttachmentType {
    BIZ_LICENSE,
    BUSINESS_CARD,
    TAX_INVOICE,
    CONTRACT,
    /** P1 — 영업 직원 거래처 방문 시 현장 촬영 사진. {@code /admin/partners/{partnerCode}/visit-attachments} 전용. */
    VISIT_PHOTO,
    OTHER
}
