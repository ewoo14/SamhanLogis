package com.samhanair.logis.accounting.web.dto;

import java.util.List;

/**
 * 통장 CSV import 결과.
 *
 * <p>#810 적대검증 R1 (L4-M1) — 매핑은 있으나 거래처 master 가 stale(미존재/비활성)이어서
 * 자동 적용을 보류한 건수와 근거(정규화 키)를 표면화한다. 관리자는 이 값으로
 * 'stale 보류'와 '매핑 없음'을 구분할 수 있다.
 *
 * @param totalRows             CSV 데이터 행 수
 * @param importedCount         신규 적재 건수
 * @param duplicateSkippedCount 중복으로 skip 된 건수
 * @param staleSkippedCount     매핑 stale 로 자동 적용을 보류한 건수
 * @param staleNormalizedNames  stale 보류 근거 정규화 키(중복 제거)
 */
public record BankTransactionImportResult(
        int totalRows,
        int importedCount,
        int duplicateSkippedCount,
        int staleSkippedCount,
        List<String> staleNormalizedNames
) {

    /** stale 보류가 없는 기존 3-인자 호환 생성자. */
    public BankTransactionImportResult(int totalRows, int importedCount, int duplicateSkippedCount) {
        this(totalRows, importedCount, duplicateSkippedCount, 0, List.of());
    }
}
