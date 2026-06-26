package com.samhanair.logis.notification.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.ErrorCode;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.authentication.Http403ForbiddenEntryPoint;
import org.springframework.stereotype.Component;

/** Writes Spring Security authentication failures with the service-wide ApiResponse envelope. */
@Component
@RequiredArgsConstructor
public class ApiResponseAuthenticationEntryPoint implements AuthenticationEntryPoint {

    private static final String PUSH_TOKENS_PATH = "/api/v1/push-tokens";

    private final ObjectMapper objectMapper;
    private final Http403ForbiddenEntryPoint fallbackEntryPoint = new Http403ForbiddenEntryPoint();

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
                         AuthenticationException authException) throws IOException {
        if (!isPushTokensPath(request)) {
            fallbackEntryPoint.commence(request, response, authException);
            return;
        }
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        objectMapper.writeValue(response.getWriter(),
                ApiResponse.fail(ErrorCode.UNAUTHORIZED, ErrorCode.UNAUTHORIZED.getDefaultMessage()));
    }

    private boolean isPushTokensPath(HttpServletRequest request) {
        String uri = request.getRequestURI();
        return PUSH_TOKENS_PATH.equals(uri) || (uri != null && uri.startsWith(PUSH_TOKENS_PATH + "/"));
    }
}
