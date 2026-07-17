package com.samhanair.logis.accounting.web.dto;

import java.util.List;

/**
 * 통장 CSV import 결과.
 *
 * <p>#810 적대검증 R1 (L4-M1) — 매핑은 있으나 거래처 master 가 stale(미존재/비활성)이어서
 * 자동 적용을 보류한 건수와 근거(정규화 키)를 표면화한다. 관리자는 이 값으로
 * 'stale 보류'와 '매핑 없음'을 구분할 수 있다.
 *
 * <p>#810 적대검증 R3 (L2-M1) — 거래처 조회가 일시 장애(UNAVAILABLE)인 행은 배치를 중단하지
 * 않고 해당 행만 저장 없이 skip 한다(행격리). skip 건수와 근거 이름을 additive 로 표면화해
 * 운영자가 재시도 대상 행을 식별할 수 있게 한다. 저장하지 않으므로 다음 import 재시도에서
 * 중복으로 오인되지 않고 자동 매핑을 다시 시도한다(R2 stale write 방지 의도 유지).
 *
 * @param totalRows                CSV 데이터 행 수
 * @param importedCount            신규 적재 건수
 * @param duplicateSkippedCount    중복으로 skip 된 건수
 * @param staleSkippedCount        매핑 stale 로 자동 적용을 보류한 건수
 * @param staleNormalizedNames     stale 보류 근거 정규화 키(중복 제거)
 * @param unavailableSkippedCount  거래처 조회 일시 장애로 저장 없이 skip 한 건수(재시도 대상)
 * @param unavailableNames         unavailable skip 근거 이름 — 매핑 정규화 키(중복 제거)
 */
public record BankTransactionImportResult(
        int totalRows,
        int importedCount,
        int duplicateSkippedCount,
        int staleSkippedCount,
        List<String> staleNormalizedNames,
        int unavailableSkippedCount,
        List<String> unavailableNames
) {

    /** stale 보류가 없는 기존 3-인자 호환 생성자. */
    public BankTransactionImportResult(int totalRows, int importedCount, int duplicateSkippedCount) {
        this(totalRows, importedCount, duplicateSkippedCount, 0, List.of(), 0, List.of());
    }

    /** unavailable skip 이 없는 기존 5-인자 호환 생성자. */
    public BankTransactionImportResult(int totalRows, int importedCount, int duplicateSkippedCount,
                                       int staleSkippedCount, List<String> staleNormalizedNames) {
        this(totalRows, importedCount, duplicateSkippedCount, staleSkippedCount, staleNormalizedNames,
                0, List.of());
    }
}
