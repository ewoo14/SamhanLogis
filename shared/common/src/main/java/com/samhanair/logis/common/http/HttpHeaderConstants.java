package com.samhanair.logis.common.http;

/**
 * 서비스 간 공통 HTTP header 이름.
 */
public final class HttpHeaderConstants {

    /** 호출자 UUID header. */
    public static final String CALLER_ID_HEADER = "X-User-Id";

    /** 호출자 표시명 header. */
    public static final String CALLER_NAME_HEADER = "X-User-Name";

    private HttpHeaderConstants() {
    }
}
