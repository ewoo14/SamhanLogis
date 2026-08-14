package com.samhanair.logis.partner.config;

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
import java.util.Locale;
import java.util.Set;
import org.springframework.web.filter.OncePerRequestFilter;

/** 공개 표면에서 inbound identity 헤더를 제거한다. */
public class PublicIdentityHeaderSanitizingFilter extends OncePerRequestFilter {
    private static final Set<String> HEADERS = HttpHeaderConstants.INBOUND_IDENTITY_HEADERS.stream()
            .map(h -> h.toLowerCase(Locale.ROOT)).collect(java.util.stream.Collectors.toUnmodifiableSet());
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String p = request.getRequestURI();
        if (!(p.startsWith("/actuator/") || p.startsWith("/v3/api-docs/") || p.startsWith("/swagger-ui/"))
                && !"/swagger-ui.html".equals(p)) { chain.doFilter(request, response); return; }
        chain.doFilter(new Wrapper(request), response);
    }
    private static final class Wrapper extends HttpServletRequestWrapper {
        Wrapper(HttpServletRequest r) { super(r); }
        @Override public String getHeader(String n) { return clean(n) ? null : super.getHeader(n); }
        @Override public Enumeration<String> getHeaders(String n) { return clean(n) ? Collections.emptyEnumeration() : super.getHeaders(n); }
        @Override public Enumeration<String> getHeaderNames() { Set<String> s = new HashSet<>(Collections.list(super.getHeaderNames())); s.removeIf(Wrapper::clean); return Collections.enumeration(s); }
        @Override public int getIntHeader(String n) { return clean(n) ? -1 : super.getIntHeader(n); }
        @Override public long getDateHeader(String n) { return clean(n) ? -1L : super.getDateHeader(n); }
        private static boolean clean(String n) { return n != null && HEADERS.contains(n.toLowerCase(Locale.ROOT)); }
    }
}
