package com.samhanair.logis.common.excel;

import java.util.List;
import java.util.Map;

/**
 * Excel 생성 요청 모델 — 시트 이름 / 컬럼 정의 / 데이터 행 목록을 보유.
 *
 * <p>각 row 는 {@code Map<String, Object>} 형태로 전달되며, 키는 {@link ExcelColumn#dataKey()} 와 일치해야 한다.
 * 값이 {@code null} 인 경우 빈 문자열로 처리된다.
 *
 * <h3>사용 예시</h3>
 * <pre>{@code
 * List<ExcelColumn> columns = List.of(
 *     ExcelColumn.text("거래처코드", "partnerCode", 4_000),
 *     ExcelColumn.text("거래처명",   "name",        7_000),
 *     ExcelColumn.numeric("미수금",  "outstandingBalance")
 * );
 * List<Map<String, Object>> rows = partners.stream()
 *     .map(p -> Map.of(
 *         "partnerCode", p.getPartnerCode(),
 *         "name",        p.getName(),
 *         "outstandingBalance", p.getOutstandingBalance()
 *     ))
 *     .toList();
 * ExcelExportRequest req = new ExcelExportRequest("거래처목록", columns, rows);
 * }</pre>
 *
 * @param sheetName 시트 이름 (최대 31자, Excel 제약)
 * @param columns   컬럼 메타데이터 순서 리스트
 * @param rows      데이터 행 목록 (각 항목은 dataKey → 값 매핑)
 */
public record ExcelExportRequest(
        String sheetName,
        List<ExcelColumn> columns,
        List<Map<String, Object>> rows
) {
}
