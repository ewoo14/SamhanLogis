package com.samhanair.logis.accounting.config;

import com.samhanair.logis.common.http.HttpHeaderConstants;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Collections;
import java.util.Enumeration;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.web.filter.OncePerRequestFilter;

/** 공개 endpoint에서 신뢰 경계 밖 identity header가 downstream에 존재하지 않게 한다. */
public class PublicIdentityHeaderSanitizingFilter extends OncePerRequestFilter {

    private static final List<String> PUBLIC_PREFIXES = List.of(
            "/actuator/", "/v3/api-docs/", "/swagger-ui/");
    private static final Set<String> SANITIZED_HEADERS = HttpHeaderConstants.INBOUND_IDENTITY_HEADERS.stream()
            .map(header -> header.toLowerCase(Locale.ROOT))
            .collect(java.util.stream.Collectors.toUnmodifiableSet());

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (!isPublic(request)) {
            chain.doFilter(request, response);
            return;
        }
        chain.doFilter(new SanitizedRequest(request), response);
    }

    private boolean isPublic(HttpServletRequest request) {
        String path = request.getRequestURI();
        return "/swagger-ui.html".equals(path)
                || PUBLIC_PREFIXES.stream().anyMatch(path::startsWith);
    }

    private static final class SanitizedRequest extends HttpServletRequestWrapper {
        private SanitizedRequest(HttpServletRequest request) {
            super(request);
        }

        @Override
        public String getHeader(String name) {
            return isSanitized(name) ? null : super.getHeader(name);
        }

        @Override
        public Enumeration<String> getHeaders(String name) {
            return isSanitized(name) ? Collections.emptyEnumeration() : super.getHeaders(name);
        }

        @Override
        public Enumeration<String> getHeaderNames() {
            Set<String> names = new HashSet<>(Collections.list(super.getHeaderNames()));
            names.removeIf(SanitizedRequest::isSanitized);
            return Collections.enumeration(names);
        }

        @Override
        public int getIntHeader(String name) {
            return isSanitized(name) ? -1 : super.getIntHeader(name);
        }

        @Override
        public long getDateHeader(String name) {
            return isSanitized(name) ? -1L : super.getDateHeader(name);
        }

        private static boolean isSanitized(String name) {
            return name != null && SANITIZED_HEADERS.contains(name.toLowerCase(Locale.ROOT));
        }
    }
}
