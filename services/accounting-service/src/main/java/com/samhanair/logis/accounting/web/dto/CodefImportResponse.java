package com.samhanair.logis.accounting.web.dto;

/**
 * CODEF 은행·카드 거래내역 import 결과.
 *
 * @param fetchedCount          CODEF client 조회 건수
 * @param importedCount         신규 적재 건수
 * @param duplicateSkippedCount externalRef 중복으로 skip 된 건수
 * @param matchedCount          거래처 자동 매칭 성공 건수
 */
public record CodefImportResponse(
        int fetchedCount,
        int importedCount,
        int duplicateSkippedCount,
        int matchedCount
) {
}
