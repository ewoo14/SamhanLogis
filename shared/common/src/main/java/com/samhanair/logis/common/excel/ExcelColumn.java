package com.samhanair.logis.common.excel;

/**
 * Excel 컬럼 메타데이터 — 헤더 / 데이터 키 / 열 너비 / 숫자 형식.
 *
 * <p>각 Excel export 호출 시 컬럼 순서대로 List 로 전달.
 * {@link #dataKey} 는 {@code Map<String, Object>} row 에서 값을 조회할 때 사용하는 키.
 * {@link #width} 는 Apache POI 의 {@code setColumnWidth()} 단위 (1/256 문자 너비).
 * 일반적인 한글 컬럼은 4,000~8,000 사이 권장.
 *
 * @param header   한국어 헤더 문자열 (예: "거래처코드")
 * @param dataKey  row Map 의 키 (예: "partnerCode")
 * @param width    열 너비 (기본값 5,000)
 * @param numericFormat  {@code true} 이면 천 단위 콤마 + 소수 없음 형식 적용 (금액 / 수량)
 */
public record ExcelColumn(
        String header,
        String dataKey,
        int width,
        boolean numericFormat
) {

    /**
     * 텍스트 컬럼 생성 (기본 너비 5,000).
     *
     * @param header  한국어 헤더
     * @param dataKey row Map 키
     * @return ExcelColumn
     */
    public static ExcelColumn text(String header, String dataKey) {
        return new ExcelColumn(header, dataKey, 5_000, false);
    }

    /**
     * 너비 지정 텍스트 컬럼 생성.
     *
     * @param header  한국어 헤더
     * @param dataKey row Map 키
     * @param width   열 너비 (1/256 문자)
     * @return ExcelColumn
     */
    public static ExcelColumn text(String header, String dataKey, int width) {
        return new ExcelColumn(header, dataKey, width, false);
    }

    /**
     * 숫자(금액/수량) 컬럼 생성 — 천 단위 콤마 형식 적용, 기본 너비 4,500.
     *
     * @param header  한국어 헤더
     * @param dataKey row Map 키
     * @return ExcelColumn
     */
    public static ExcelColumn numeric(String header, String dataKey) {
        return new ExcelColumn(header, dataKey, 4_500, true);
    }
}
