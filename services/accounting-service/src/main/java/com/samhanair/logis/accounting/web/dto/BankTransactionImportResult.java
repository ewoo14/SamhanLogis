package com.samhanair.logis.accounting.web.dto;

import java.util.List;

/**
 * 통장 CSV import 결과.
 *
 * <p>#810 적대검증 R1 (L4-M1) — 매핑은 있으나 거래처 master 가 stale(미존재/비활성)이어서
 * 자동 적용을 보류한 건수와 근거(정규화 키)를 표면화한다. 관리자는 이 값으로
 * 'stale 보류'와 '매핑 없음'을 구분할 수 있다.
 *
 * <p>#810 R3-CODEX (S1-H1) — 거래처 조회가 일시 장애(UNAVAILABLE)인 행도 은행거래 자체는
 * 항상 저장하고 <b>매칭만</b> 보류한다(미매칭 저장). 저장-전 skip 은 거래를 영구 유실시켰다.
 * 보류 건수와 근거 이름을 additive 로 표면화해 운영자가 장애 복구 후 수동 매칭 대상 행을
 * 식별할 수 있게 한다. 배치는 계속(행격리)되며 잘못된 매칭 write 는 하지 않는다(R2 의도 유지).
 *
 * @param totalRows                CSV 데이터 행 수
 * @param importedCount            신규 적재 건수(매칭 보류 행 포함 — 거래는 항상 영속화)
 * @param duplicateSkippedCount    중복으로 skip 된 건수
 * @param staleSkippedCount        매핑 stale 로 자동 적용을 보류한 건수
 * @param staleNormalizedNames     stale 보류 근거 정규화 키(중복 제거)
 * @param unavailableSkippedCount  거래처 조회 일시 장애로 매칭을 보류한 건수(거래는 미매칭 저장·수동 매칭 대상)
 * @param unavailableNames         unavailable 매칭 보류 근거 이름 — 매핑 정규화 키(중복 제거)
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
