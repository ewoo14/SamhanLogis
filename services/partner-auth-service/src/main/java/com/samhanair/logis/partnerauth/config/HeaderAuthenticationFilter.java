package com.samhanair.logis.partnerauth.config;

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
    private final String expectedAttestation; private final boolean enforceAttestation;
    public HeaderAuthenticationFilter(){this("",false);} public HeaderAuthenticationFilter(String a,boolean e){expectedAttestation=a==null?"":a;enforceAttestation=e;}
    @Override protected void doFilterInternal(HttpServletRequest r,HttpServletResponse s,FilterChain c)throws ServletException,IOException{
        String p=r.getRequestURI(); if(isPublic(p)||p.startsWith("/internal/")||isInternalPrincipal()){c.doFilter(r,s);return;}
        if(enforceAttestation&&!isAttested(r)){s.setStatus(HttpServletResponse.SC_UNAUTHORIZED);return;}
        String id=r.getHeader(HttpHeaderConstants.CALLER_ID_HEADER),groups=r.getHeader(HttpHeaderConstants.USER_GROUPS_HEADER);
        if(id!=null&&!id.isBlank()&&SecurityContextHolder.getContext().getAuthentication()==null){List<SimpleGrantedAuthority>a=new ArrayList<>();if(groups!=null&&!groups.isBlank())for(String g:groups.split(","))if(!g.isBlank())a.add(new SimpleGrantedAuthority("GROUP_"+g.trim()));SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(id,null,a));}
        c.doFilter(r,s);
    }
    private boolean isPublic(String p){return p.startsWith("/actuator/")||p.startsWith("/v3/api-docs/")||p.startsWith("/swagger-ui/")||"/swagger-ui.html".equals(p)||p.startsWith("/api/v1/auth/partner-");}
    private boolean isInternalPrincipal(){var a=SecurityContextHolder.getContext().getAuthentication();return a!=null&&"system-internal".equals(a.getName());}
    private boolean isAttested(HttpServletRequest r){String a=r.getHeader(HttpHeaderConstants.GATEWAY_ATTESTATION_HEADER);return !expectedAttestation.isBlank()&&a!=null&&!a.isBlank()&&MessageDigest.isEqual(expectedAttestation.getBytes(StandardCharsets.UTF_8),a.getBytes(StandardCharsets.UTF_8));}
}
