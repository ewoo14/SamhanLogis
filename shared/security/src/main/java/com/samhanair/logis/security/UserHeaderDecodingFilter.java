package com.samhanair.logis.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URLDecoder;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Gateway 가 URL-encoded 로 전파한 사용자 표시명 헤더를 servlet service 진입점에서 복원한다.
 *
 * <p>디코딩 대상은 {@code X-User-Name} 단일 헤더다. {@code X-User-Department} 는 기존
 * {@link HrAuthorizationHelper} 등 소비처에서 이미 디코딩하므로 여기서 건드리지 않는다.
 *
 * <p>한계: URL decoding 은 form 규칙을 따르므로 {@code +} 는 공백으로 해석된다. Latin-1 복구는
 * servlet 컨테이너가 UTF-8 bytes 를 ISO-8859-1 문자로 읽은 연속 구간만 대상으로 하며, 유효한 유니코드와
 * mojibake byte 가 섞인 경계는 보수적으로 원문을 유지한다.
 */
public class UserHeaderDecodingFilter extends OncePerRequestFilter {

    private static final String USER_NAME_HEADER = "X-User-Name";

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain)
            throws ServletException, IOException {
        if (request.getHeader(USER_NAME_HEADER) == null) {
            filterChain.doFilter(request, response);
            return;
        }
        filterChain.doFilter(new UserNameHeaderRequest(request), response);
    }

    private static String decodeUserName(String value) {
        return stripControlCharacters(repairUtf8BytesReadAsIso88591(decodeUrlEncodedUserName(value)));
    }

    private static String decodeUrlEncodedUserName(String value) {
        if (value == null || (!value.contains("%") && !value.contains("+"))) {
            return value;
        }
        try {
            return URLDecoder.decode(value, StandardCharsets.UTF_8);
        } catch (IllegalArgumentException ex) {
            return value;
        }
    }

    private static String repairUtf8BytesReadAsIso88591(String value) {
        if (value == null || !hasIso88591HighBit(value)) {
            return value;
        }
        StringBuilder repaired = new StringBuilder(value.length());
        int start = 0;
        while (start < value.length()) {
            char ch = value.charAt(start);
            if (ch > '\u00FF') {
                repaired.append(ch);
                start++;
                continue;
            }
            int end = start + 1;
            boolean hasHighBit = ch >= '\u0080';
            while (end < value.length() && value.charAt(end) <= '\u00FF') {
                char next = value.charAt(end);
                hasHighBit = hasHighBit || next >= '\u0080';
                end++;
            }
            String segment = value.substring(start, end);
            repaired.append(hasHighBit ? repairIso88591Segment(segment) : segment);
            start = end;
        }
        return repaired.toString();
    }

    private static String repairIso88591Segment(String segment) {
        try {
            String repaired = StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(segment.getBytes(StandardCharsets.ISO_8859_1)))
                    .toString();
            if (!repaired.equals(segment)) {
                return repaired;
            }
        } catch (CharacterCodingException ex) {
            return segment;
        }
        return segment;
    }

    private static boolean hasIso88591HighBit(String value) {
        for (int i = 0; i < value.length(); i++) {
            char ch = value.charAt(i);
            if (ch >= '\u0080' && ch <= '\u00FF') {
                return true;
            }
        }
        return false;
    }

    private static String stripControlCharacters(String value) {
        if (value == null) {
            return null;
        }
        StringBuilder sanitized = new StringBuilder(value.length());
        for (int i = 0; i < value.length(); i++) {
            char ch = value.charAt(i);
            if ((ch <= '\u001F') || (ch >= '\u007F' && ch <= '\u009F')) {
                continue;
            }
            sanitized.append(ch);
        }
        return sanitized.toString();
    }

    private static boolean isUserNameHeader(String name) {
        return USER_NAME_HEADER.equalsIgnoreCase(name);
    }

    private static final class UserNameHeaderRequest extends HttpServletRequestWrapper {

        private UserNameHeaderRequest(HttpServletRequest request) {
            super(request);
        }

        @Override
        public String getHeader(String name) {
            String value = super.getHeader(name);
            return isUserNameHeader(name) ? decodeUserName(value) : value;
        }

        @Override
        public Enumeration<String> getHeaders(String name) {
            Enumeration<String> headers = super.getHeaders(name);
            if (!isUserNameHeader(name)) {
                return headers;
            }
            List<String> decoded = Collections.list(headers).stream()
                    .map(UserHeaderDecodingFilter::decodeUserName)
                    .toList();
            return Collections.enumeration(decoded);
        }
    }
}
