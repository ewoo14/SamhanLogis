package com.samhanair.logis.inventory.web.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * DPS 입고 비교 결과 응답 — POST {@code /warehouse/audit/dps-compare} (PR-E1 BE-2).
 *
 * <p>legacy GAS 1번 / 16번 의 결과 시트 컬럼을 1 record 로 표현. 호출자 (FE) 는 본 응답을
 * 결과 표 / 다운로드 버튼 / mismatch 요약 카드로 렌더한다.
 *
 * @param from           조회 기간 시작 (echo)
 * @param to             조회 기간 종료 (echo)
 * @param groupBy        매칭 단위 (SLIP / ITEM)
 * @param inboundCount   입고전표 라인 수 (slip-service 응답 건수)
 * @param dpsRowCount    DPS 엑셀 row 수 (헤더 제외)
 * @param matchedCount   정상 일치 건수
 * @param mismatchCount  불일치 건수
 * @param mismatches     mismatch 라인 상세 (legacy 결과 시트의 행)
 */
public record DpsCompareResponse(
        LocalDate from,
        LocalDate to,
        String groupBy,
        int inboundCount,
        int dpsRowCount,
        int matchedCount,
        int mismatchCount,
        List<RowMismatch> mismatches) {
}
