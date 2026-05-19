package com.samhanair.logis.partner.dto;

import java.util.List;

/**
 * MIG-1 PoC — 이카운트 거래처 CSV 17 컬럼 import 결과.
 *
 * <p>spec: docs/superpowers/specs/2026-05-19-ecount-mig-1-partner-design.md (D-MIG-1-11).
 * 총 row / 분류 카테고리 5 (신규 / 갱신 / 거래처명 누락 / 거래처코드 placeholder / SUSPENDED 분포) + sample reject 최대 20건.
 *
 * @param totalRows CSV 데이터 row 수 (메타 + 헤더 제외)
 * @param imported 신규 INSERT 건수 (transform_status=IMPORTED)
 * @param updated 기존 partner_code UPSERT 갱신 건수 (transform_status=UPDATED)
 * @param rejectedNullName 거래처명 빈값 거부 (transform_status=REJECT_NAME_NULL, staging 적재만)
 * @param skippedPlaceholder 거래처코드 placeholder 가짜값 (transform_status=SKIPPED_PLACEHOLDER, staging 적재만)
 * @param activeCount 적재 결과 ACTIVE 분포 (사용구분 YES)
 * @param suspendedCount 적재 결과 SUSPENDED 분포 (사용구분 빈/NO)
 * @param sourceFileHash 본 import 의 SHA-256 hex (멱등 키 — 재실행 시 동일 hash → staging 동일 row 갱신)
 * @param rejectedSample reject/skip 샘플 최대 20건 (사용자 검토용 — 전체는 staging 조회)
 */
public record EcountPartnerImportResult(
        int totalRows,
        int imported,
        int updated,
        int rejectedNullName,
        int skippedPlaceholder,
        int activeCount,
        int suspendedCount,
        String sourceFileHash,
        List<RejectedRow> rejectedSample) {

    /**
     * reject / skip row sample — CSV row 번호 (1-base, 메타=1 / 헤더=2 / 데이터=3+) + 사유 + 입력 거래처명.
     *
     * @param rowNumber CSV 1-base row 번호 (3 이상)
     * @param reason 분류 사유 (REJECT_NAME_NULL / SKIPPED_PLACEHOLDER)
     * @param rawPartnerCode CSV 거래처코드 raw (placeholder 또는 빈값 그대로)
     * @param rawName CSV 거래처명 raw (REJECT 시 빈문자열)
     */
    public record RejectedRow(
            int rowNumber,
            String reason,
            String rawPartnerCode,
            String rawName) {
    }
}
