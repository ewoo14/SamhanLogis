package com.samhanair.logis.partnerorder.service;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 2026-08-15 실측 대조표에서 나온 임시 창고 예외 목록이다.
 *
 * <p>분류 기준과 레거시 판정이 갈리는 상품만 대상으로 하며, 분류가 정리되면
 * 대조표와 함께 항목을 제거한다. 이 목록은 주문서웹 확정의 창고 판정에서만 사용한다.
 */
public final class LegacyWarehouseExceptions {
    private static final String SOURCE =
            "docs/dev-reports/2026-08-15-order-web-warehouse-category-mapping.md";

    private static final List<Exception> EXCEPTIONS = List.of(
            new Exception("AR-CH01", "2", "HOME 인피니트 레거시 적중 / 분류 비적중"),
            new Exception("AC060CXAPBH1", "2", "360 레거시 적중 / 분류 비적중"),
            new Exception("AC072CXAPBH1", "2", "360 레거시 적중 / 분류 비적중"),
            new Exception("AC090CXAPBH1", "2", "360 레거시 적중 / 분류 비적중"),
            new Exception("AC100CXAPBH1", "2", "360 레거시 적중 / 분류 비적중"),
            new Exception("AC100CXAPHH1", "2", "360 레거시 적중 / 분류 비적중"),
            new Exception("AC110CXAPBH1", "2", "360 레거시 적중 / 분류 비적중"),
            new Exception("AC110CXAPHH1", "2", "360 레거시 적중 / 분류 비적중"),
            new Exception("AC130CXAPBH1", "2", "360 레거시 적중 / 분류 비적중"),
            new Exception("AC130CXAPHH1", "2", "360 레거시 적중 / 분류 비적중"),
            new Exception("AC145CXAPHH1", "2", "360 레거시 적중 / 분류 비적중"),
            new Exception("AC145BXADHH1", "2", "덕트 레거시 적중 / 분류 비적중"),
            new Exception("AR06A9170HNQ", "2", "벽걸이·가정용 에어컨 레거시 적중 / 분류 비적중"),
            new Exception("AR06B9150HNQ", "2", "벽걸이·가정용 에어컨 레거시 적중 / 분류 비적중"),
            new Exception("AR06D9151HNQ", "2", "벽걸이·가정용 에어컨 레거시 적중 / 분류 비적중"),
            new Exception("AR60F06D1A0Q", "2", "벽걸이·가정용 에어컨 레거시 적중 / 분류 비적중"),
            new Exception("AR60F06D1A1Q", "2", "벽걸이·가정용 에어컨 레거시 적중 / 분류 비적중"),
            new Exception("AR70H06D1A1Q", "2", "벽걸이·가정용 에어컨 레거시 적중 / 분류 비적중"),
            new Exception("AR80F06D2A1Q", "2", "벽걸이·가정용 에어컨 레거시 적중 / 분류 비적중"),
            new Exception("AR80H06D2A1Q", "2", "벽걸이·가정용 에어컨 레거시 적중 / 분류 비적중"),
            new Exception("ARR-NK3F", "2", "벽걸이 레거시 적중 / 분류 비적중"),
            new Exception("ARR-PK8F", "2", "벽걸이 레거시 적중 / 분류 비적중"),
            new Exception("ARR-WK8F", "2", "벽걸이 레거시 적중 / 분류 비적중"),
            new Exception("FRC-1438XAF2", "2", "벽걸이 레거시 적중 / 분류 비적중"),
            new Exception("FRH-1412NA3", "2", "벽걸이 레거시 적중 / 분류 비적중"),
            new Exception("FRH-1412XA3", "2", "벽걸이 레거시 적중 / 분류 비적중"),
            new Exception("FRH-1438NH3", "2", "벽걸이 레거시 적중 / 분류 비적중"),
            new Exception("AC060CS6PBH1SY", "00003", "360 분류 적중 / 레거시 비적중"),
            new Exception("AC110BXAPBH3", "00003", "비스포크 분류 적중 / 레거시 비적중"),
            new Exception("AC110BXAPHH3", "00003", "비스포크 분류 적중 / 레거시 비적중"),
            new Exception("AC145BXAPHH5", "00003", "비스포크 분류 적중 / 레거시 비적중"),
            new Exception("AP083BXPPBH3", "00003", "비스포크 분류 적중 / 레거시 비적중"));

    private static final Map<String, Exception> BY_MODEL = EXCEPTIONS.stream()
            .collect(Collectors.toUnmodifiableMap(Exception::modelCode, Function.identity()));

    private LegacyWarehouseExceptions() {
    }

    public static List<Exception> all() {
        return EXCEPTIONS;
    }

    public static Exception find(String modelCode) {
        return BY_MODEL.get(modelCode);
    }

    public static String source() {
        return SOURCE;
    }

    public record Exception(String modelCode, String warehouseCode, String reason) {
    }
}
