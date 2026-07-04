package com.samhanair.logis.accounting.util;

/**
 * 문서번호 URL path 식별자 정규화 helper.
 *
 * <p>저장/화면 표준은 {@code yyyy/MM/dd-N} 이지만 URL path 에서는 슬래시가 라우팅 경계를
 * 만들기 때문에 FE 가 {@code yyyy-MM-dd-N} 단일 세그먼트로 전송한다. 서버 진입점에서
 * 날짜 영역의 첫 두 하이픈만 슬래시로 되돌리고, 마지막 순번 구분 하이픈은 유지한다.
 */
public final class DocumentNumberPathResolver {

    private DocumentNumberPathResolver() {
    }

    public static String toSlashDocumentNo(String value) {
        if (value == null || value.length() < 11) {
            return value;
        }
        if (value.charAt(4) == '-' && value.charAt(7) == '-') {
            return value.substring(0, 4) + "/" + value.substring(5, 7) + "/" + value.substring(8);
        }
        return value;
    }
}
