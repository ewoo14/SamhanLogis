package com.samhanair.logis.partner.dto;

import java.util.List;

/**
 * MIG-1 PoC — 이카운트 거래처 CSV 17 컬럼 import 결과.
 *
 * <p>spec: docs/superpowers/specs/2026-05-19-ecount-mig-1-partner-design.md (D-MIG-1-11).
 * 총 row / 분류 카테고리 + trailer 제외 및 파싱·DB 적재 보류 건수. UUID는 응답에 노출하지 않는다.
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
        List<RejectedRow> rejectedSample,
        int excludedTrailerRows,
        /** 파싱 또는 행 단위 DB 제약 실패로 보류된 건수. */
        int heldParseFailureRows,
        List<RejectedRow> heldSample,
        /** 행 단위 적재 중 데이터 제약이 아닌 인프라 계층에서 실패한 건수. 재시도 대상이다. */
        int infrastructureFailureRows,
        /** 인프라 실패 표본 최대 20건. {@code reason=DB_INFRASTRUCTURE}로 데이터 실패와 구분한다. */
        List<RejectedRow> infrastructureFailureSample,
        /** 인프라 실패가 포함되어 전체 성공으로 해석하면 안 되는 응답인지 여부. */
        boolean infrastructureFailure,
        int registrationDateParsedCount,
        int createdAtLoadTimeCount) {

    /** 하위 호환 별칭: 등록일자 공란/실패로 적재 시각을 사용한 건수. */
    public int registrationDateNullRows() {
        return createdAtLoadTimeCount;
    }

    /** 적재 시점(now)을 created_at에 사용한 건수. */
    public int createdAtLoadTimeCount() { return createdAtLoadTimeCount; }

    /**
     * reject / skip row sample — CSV row 번호 (1-base, 메타=1 / 헤더=2 / 데이터=3+) + 사유 + 입력 거래처명.
     *
     * @param rowNumber CSV 1-base row 번호 (3 이상)
     * @param reason 분류 사유 (REJECT_NAME_NULL / SKIPPED_PLACEHOLDER / DB_CONSTRAINT / DB_INFRASTRUCTURE)
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
