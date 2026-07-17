package com.samhanair.logis.accounting.util;

import java.util.Locale;

/**
 * 입금자명 매핑 키를 만드는 단일 정규화기.
 *
 * <p>의미가 다른 거래처를 과도하게 합치지 않도록 Unicode 정규화나 괄호·특수문자 제거는
 * 수행하지 않는다. Java의 {@link Character#isWhitespace(char)}와 {@link Character#isSpaceChar(char)}
 * 를 함께 사용해 일반 공백과 NBSP 계열을 동일하게 처리한다.
 */
public final class DepositorNameNormalizer {

    private DepositorNameNormalizer() {
    }

    /**
     * 앞뒤 공백을 제거하고 내부 Unicode 공백 연속을 한 칸으로 축약한 뒤 대문자화한다.
     *
     * @param raw 원본 입금자명
     * @return 정규화 키, null 입력이면 null
     */
    public static String normalize(String raw) {
        if (raw == null) {
            return null;
        }
        StringBuilder normalized = new StringBuilder(raw.length());
        boolean pendingSpace = false;
        for (int offset = 0; offset < raw.length();) {
            int codePoint = raw.codePointAt(offset);
            offset += Character.charCount(codePoint);
            if (isUnicodeSpace(codePoint)) {
                if (normalized.length() > 0) {
                    pendingSpace = true;
                }
                continue;
            }
            if (pendingSpace) {
                normalized.append(' ');
                pendingSpace = false;
            }
            normalized.appendCodePoint(codePoint);
        }
        return normalized.toString().toUpperCase(Locale.ROOT);
    }

    private static boolean isUnicodeSpace(int codePoint) {
        return Character.isWhitespace(codePoint) || Character.isSpaceChar(codePoint);
    }
}
