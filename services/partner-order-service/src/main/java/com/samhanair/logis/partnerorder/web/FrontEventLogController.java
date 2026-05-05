package com.samhanair.logis.partnerorder.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.partnerorder.domain.FrontEventLog;
import com.samhanair.logis.partnerorder.repository.FrontEventLogRepository;
import com.samhanair.logis.partnerorder.web.dto.FrontEventLogRequest;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 프론트 액션 로그 endpoint (legacy logFrontEvent 8252). silent fail 가드 — 어떤 결과든 200 반환.
 *
 * <p>SecurityConfig 에서 익명 허용 — 로그인 전 액션 (mobile-gate 진입 등) 도 기록.
 */
@RestController
@RequestMapping("/api/v1/partner-orders/log")
@RequiredArgsConstructor
public class FrontEventLogController {

    private static final Logger log = LoggerFactory.getLogger(FrontEventLogController.class);

    private static final String PARTNER_CODE_HEADER = "X-Partner-Code";
    private static final String BIZ_CODE_HEADER = "X-Biz-Code";

    private final FrontEventLogRepository logRepository;

    @Operation(summary = "프론트 액션 로그",
            description = "silent fail — 실패해도 200 반환 (legacy 동작)")
    @PostMapping
    public ApiResponse<Void> logAction(
            @Valid @RequestBody FrontEventLogRequest request,
            @RequestHeader(value = PARTNER_CODE_HEADER, required = false) String partnerCode,
            @RequestHeader(value = BIZ_CODE_HEADER, required = false) String bizCode,
            HttpServletRequest httpRequest) {
        try {
            String ip = resolveClientIp(httpRequest);
            String ua = httpRequest.getHeader("User-Agent");
            logRepository.save(FrontEventLog.of(
                    partnerCode, bizCode, request.action(), request.detail(), ip, ua));
        } catch (RuntimeException ex) {
            log.warn("FrontEventLog silent fail: {}", ex.getMessage());
        }
        return ApiResponse.ok(null);
    }

    private String resolveClientIp(HttpServletRequest req) {
        String xff = req.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            int comma = xff.indexOf(',');
            return comma > 0 ? xff.substring(0, comma).trim() : xff.trim();
        }
        return req.getRemoteAddr();
    }
}
