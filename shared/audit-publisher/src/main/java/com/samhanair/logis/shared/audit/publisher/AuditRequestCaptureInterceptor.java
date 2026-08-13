package com.samhanair.logis.shared.audit.publisher;

import java.util.UUID;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.slf4j.MDC;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.HandlerMapping;

import com.samhanair.logis.shared.audit.contract.AuditEventV2;

import lombok.extern.slf4j.Slf4j;

/**
 * 파일럿 서비스의 모든 업무 HTTP 요청 결과를 한 요청당 한 건으로 중앙 감사 이벤트화한다.
 *
 * <p>업무 handler와 분리된 after-completion 경로에서 bounded publisher를 호출하므로
 * 감사 발행 장애가 업무 응답을 바꾸지 않는다.
 */
@Slf4j
public final class AuditRequestCaptureInterceptor implements HandlerInterceptor {
    private static final String START_NANOS = AuditRequestCaptureInterceptor.class.getName() + ".start";
    private static final String REQUEST_ID = "requestId";
    private static final String TRACE_ID = "traceId";

    private final String serviceName;
    private final AuditPublisher publisher;

    public AuditRequestCaptureInterceptor(String serviceName, AuditPublisher publisher) {
        this.serviceName = serviceName;
        this.publisher = publisher;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        MDC.put(REQUEST_ID, requestId(request));
        MDC.put(TRACE_ID, traceId(request));
        request.setAttribute(START_NANOS, System.nanoTime());
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                                Object handler, Exception exception) {
        try {
            int status = exception == null ? response.getStatus() : statusFromException(exception);
            long started = request.getAttribute(START_NANOS) instanceof Long value ? value : System.nanoTime();
            String route = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE) instanceof String value
                    ? value : request.getRequestURI();
            publisher.publish(AuditEventV2.httpOutcome(
                    serviceName, request.getMethod(), route, status,
                    Math.max(0L, (System.nanoTime() - started) / 1_000_000L),
                    request.getRemoteAddr(), request.getHeader("User-Agent")));
        } catch (RuntimeException ex) {
            log.warn("request audit capture failed without changing business response reason={}",
                    ex.getClass().getSimpleName());
        } finally {
            MDC.remove(REQUEST_ID);
            MDC.remove(TRACE_ID);
        }
    }

    private static int statusFromException(Exception exception) {
        return exception instanceof org.springframework.web.ErrorResponse errorResponse
                ? errorResponse.getStatusCode().value() : 500;
    }

    private static String requestId(HttpServletRequest request) {
        String value = request.getHeader("X-Request-Id");
        return value == null || value.isBlank() ? UUID.randomUUID().toString() : value;
    }

    private static String traceId(HttpServletRequest request) {
        String traceparent = request.getHeader("traceparent");
        if (traceparent != null && traceparent.split("-").length >= 4) {
            return traceparent.split("-")[1];
        }
        String value = request.getHeader("X-Trace-Id");
        return value == null || value.isBlank() ? null : value;
    }
}
