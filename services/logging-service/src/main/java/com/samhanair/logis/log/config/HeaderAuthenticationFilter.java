package com.samhanair.logis.log.config;

import com.samhanair.logis.common.http.HttpHeaderConstants;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

public class HeaderAuthenticationFilter extends OncePerRequestFilter {
    private final String expectedAttestation;
    private final boolean enforceAttestation;
    public HeaderAuthenticationFilter() { this("", false); }
    public HeaderAuthenticationFilter(String expectedAttestation, boolean enforceAttestation) { this.expectedAttestation=expectedAttestation == null ? "" : expectedAttestation; this.enforceAttestation=enforceAttestation; }
    @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain)throws ServletException,IOException {
        if (isPublic(request)) { chain.doFilter(request,response); return; }
        if (enforceAttestation && !isInternalPrincipal() && !isAttested(request)) { response.setStatus(HttpServletResponse.SC_UNAUTHORIZED); return; }
        String userId=request.getHeader(HttpHeaderConstants.CALLER_ID_HEADER), groups=request.getHeader(HttpHeaderConstants.USER_GROUPS_HEADER);
        var existing=SecurityContextHolder.getContext().getAuthentication();
        if(userId!=null&&!userId.isBlank()&&existing!=null&&"system-internal".equals(existing.getPrincipal())) {
            List<SimpleGrantedAuthority> a=new ArrayList<>(); if(existing.getAuthorities().stream().anyMatch(x->"ROLE_INTERNAL".equals(x.getAuthority()))) a.add(new SimpleGrantedAuthority("ROLE_INTERNAL"));
            if(groups!=null&&!groups.isBlank()) for(String g:groups.split(",")) if(!g.isBlank()) a.add(new SimpleGrantedAuthority("GROUP_"+g.trim()));
            if("true".equalsIgnoreCase(request.getHeader("X-Is-System-Master"))) a.add(new SimpleGrantedAuthority("ROLE_SYSTEM_MASTER"));
            SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(userId,null,a));
        }
        chain.doFilter(request,response);
    }
    private boolean isPublic(HttpServletRequest r){String p=r.getRequestURI();return p.startsWith("/actuator/")||p.startsWith("/v3/api-docs/")||p.startsWith("/swagger-ui/")||"/swagger-ui.html".equals(p);}
    private boolean isInternalPrincipal(){var a=SecurityContextHolder.getContext().getAuthentication();return a!=null&&"system-internal".equals(a.getPrincipal());}
    private boolean isAttested(HttpServletRequest r){String a=r.getHeader(HttpHeaderConstants.GATEWAY_ATTESTATION_HEADER);return !expectedAttestation.isBlank()&&a!=null&&!a.isBlank()&&MessageDigest.isEqual(expectedAttestation.getBytes(StandardCharsets.UTF_8),a.getBytes(StandardCharsets.UTF_8));}
}
