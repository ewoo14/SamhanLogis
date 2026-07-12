package com.samhanair.logis.product.service;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * 회계 일마감 품목 라벨에서 제품 모델 토큰을 추출하는 레거시 호환 유틸리티.
 *
 * <p>레거시 {@code tools/legacy-gas/일마감 프로그램/Code.js} 161~174행의
 * 순수 문자열 정제 규칙을 Java 로 포팅했다. 입력 예시는 {@code 품목명[규격]} 형태이며,
 * 대괄호/소괄호/중괄호의 규격 설명을 제거한 뒤 모델코드 prefix 패턴을 우선 반환한다.
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
     * <p>정규 모델 prefix 가 발견되면 첫 매치를 반환하고, {@code AR-}/{@code ARR-}
     * 레거시 라벨은 첫 공백 전 토큰을 반환한다. 둘 다 아니면 정제된 전체 라벨을
     * 대문자로 반환해 후속 exact/LIKE lookup 이 같은 기준을 사용하게 한다.
     *
     * @param name 원본 품목 라벨
     * @return 추출 토큰. null/blank 입력은 빈 문자열
     */
    public static String extractModelToken(String name) {
        if (name == null || name.isBlank()) {
            return "";
        }
        String u = clean(name).toUpperCase(Locale.ROOT);
        var matcher = MODEL_TOKEN.matcher(u);
        if (matcher.find()) {
            return matcher.group();
        }
        if (u.startsWith("AR-") || u.startsWith("ARR-")) {
            return u.split(" ")[0];
        }
        return u;
    }
}
