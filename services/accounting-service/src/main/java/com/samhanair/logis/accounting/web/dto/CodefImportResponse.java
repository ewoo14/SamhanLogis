package com.samhanair.logis.accounting.web.dto;

import java.util.List;

/**
 * CODEF 은행·카드 거래내역 import 결과.
 *
 * <p>#810 적대검증 R1 (L4-M1) — 입금자명 매핑이 stale(거래처 미존재/비활성)이어서 자동 적용을
 * 보류한 건수와 근거(정규화 키)를 표면화한다. KFTC 경로의 {@code mappingRawName} 노출과 대칭.
 *
 * @param fetchedCount          CODEF client 조회 건수
 * @param importedCount         신규 적재 건수
 * @param duplicateSkippedCount externalRef 중복으로 skip 된 건수
 * @param matchedCount          거래처 자동 매칭 성공 건수
 * @param staleSkippedCount     매핑 stale 로 자동 적용을 보류한 건수
 * @param staleNormalizedNames  stale 보류 근거 정규화 키(중복 제거)
 */
public record CodefImportResponse(
        int fetchedCount,
        int importedCount,
        int duplicateSkippedCount,
        int matchedCount,
        int staleSkippedCount,
        List<String> staleNormalizedNames
) {

    /** stale 보류가 없는 기존 4-인자 호환 생성자. */
    public CodefImportResponse(int fetchedCount, int importedCount, int duplicateSkippedCount, int matchedCount) {
        this(fetchedCount, importedCount, duplicateSkippedCount, matchedCount, 0, List.of());
    }
}
