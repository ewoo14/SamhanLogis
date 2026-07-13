package com.samhanair.logis.accounting.service;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * 회계 일마감 품목 라벨에서 제품 모델 토큰을 추출하는 레거시 호환 유틸리티.
 *
 * <p>product-service {@code ModelTokenExtractor} 와 동일 규칙을 accounting-service 로컬에
 * 포팅했다. MSA 경계를 지키기 위해 cross-service import 는 사용하지 않으며, shared/common 통합은
 * 후속 정리 대상이다.
 *
 * <p>괄호 3종의 설명을 제거하고 대문자화한 뒤 정규식
 * {@code (AC|AP|AR|AF|AM|AJ|AXJ|PC|AWR|ARR)[A-Z0-9\-]{4,}} 의 첫 매치를 반환한다.
 */
public final class ModelTokenExtractor {

    private static final Pattern BRACKET_CONTENT = Pattern.compile("\\[.*?]|\\(.*?\\)|\\{.*?}");
    private static final Pattern MODEL_TOKEN =
            Pattern.compile("\\b(AC|AP|AR|AF|AM|AJ|AXJ|PC|AWR|ARR)[A-Z0-9\\-]{4,}\\b");

    private ModelTokenExtractor() {
    }

    /**
     * 라벨에서 괄호 3종의 설명 영역을 제거하고 앞뒤 공백을 정리한다.
     *
     * @param name 원본 품목 라벨
     * @return null 은 빈 문자열, 그 외는 괄호 설명 제거 후 trim 된 문자열
     */
    public static String clean(String name) {
        if (name == null) {
            return "";
        }
        return BRACKET_CONTENT.matcher(name).replaceAll("").trim();
    }

    /**
     * 회계 라벨에서 모델코드 매칭용 토큰을 추출한다.
     *
     * @param name 원본 품목 라벨
     * @return 추출 토큰. null/blank 입력은 빈 문자열
     */
    public static String extractModelToken(String name) {
        if (name == null || name.isBlank()) {
            return "";
        }
        String normalized = clean(name).toUpperCase(Locale.ROOT);
        var matcher = MODEL_TOKEN.matcher(normalized);
        if (matcher.find()) {
            return matcher.group();
        }
        if (normalized.startsWith("AR-") || normalized.startsWith("ARR-")) {
            return normalized.split(" ")[0];
        }
        return normalized;
    }

    /**
     * <b>표시 전용</b> 모델 토큰 — 실제 모델 패턴(정규식/AR(R)- 접두)에 매치할 때만 토큰을 반환하고,
     * 미매치(운임·서비스 등 정규화 품명 fallback) 또는 null/blank 는 {@code null} 을 반환한다.
     *
     * <p>{@link #extractModelToken} 은 재검증 분기 로직용이라 미매치 시 정규화 품명을 fallback 하지만,
     * "모델" 컬럼 표시에는 그 fallback 이 품명과 중복되어 부적절하다. 본 메서드는 실 모델코드만 노출한다.
     *
     * @param name 원본 품목 라벨
     * @return 실 모델 토큰, 미매치/blank 는 null
     */
    public static String extractModelTokenOrNull(String name) {
        if (name == null || name.isBlank()) {
            return null;
        }
        String normalized = clean(name).toUpperCase(Locale.ROOT);
        var matcher = MODEL_TOKEN.matcher(normalized);
        if (matcher.find()) {
            return matcher.group();
        }
        if (normalized.startsWith("AR-") || normalized.startsWith("ARR-")) {
            return normalized.split(" ")[0];
        }
        return null;
    }
}
