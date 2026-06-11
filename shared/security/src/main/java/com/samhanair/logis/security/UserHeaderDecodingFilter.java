package com.samhanair.logis.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URLDecoder;
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
        if (value == null || (!value.contains("%") && !value.contains("+"))) {
            return value;
        }
        try {
            return URLDecoder.decode(value, StandardCharsets.UTF_8);
        } catch (IllegalArgumentException ex) {
            return value;
        }
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
