package com.samhanair.logis.partnerauth.controller;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.partnerauth.dto.CheckAuthStatusResponse;
import com.samhanair.logis.partnerauth.dto.ExpirationResponse;
import com.samhanair.logis.partnerauth.dto.PartnerRegisterRequest;
import com.samhanair.logis.partnerauth.dto.PartnerRegisterResponse;
import com.samhanair.logis.partnerauth.dto.SetPasswordRequest;
import com.samhanair.logis.partnerauth.dto.SetPasswordResponse;
import com.samhanair.logis.partnerauth.dto.TempPasswordRequest;
import com.samhanair.logis.partnerauth.dto.TempPasswordResponse;
import com.samhanair.logis.partnerauth.dto.TryLoginRequest;
import com.samhanair.logis.partnerauth.dto.TryLoginResponse;
import com.samhanair.logis.partnerauth.dto.TutorialUpdateRequest;
import com.samhanair.logis.partnerauth.dto.TutorialUpdateResponse;
import com.samhanair.logis.partnerauth.service.PartnerAuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;
import com.samhanair.logis.shared.audit.contract.AuditEventV2;
import com.samhanair.logis.shared.audit.publisher.AuditPublisher;
import com.samhanair.logis.partnerauth.audit.PartnerAuditClientIpResolver;

/**
 * Partner Auth Service — 7 endpoint (설계서 §3).
 *
 * <p>모든 응답은 {@link ApiResponse} envelope 으로 wrapping (성공: code=OK, 실패:
 * {@code GlobalExceptionHandler} 가 ErrorCode 기반 mapping).
 *
 * <p>UUID 비공개 (memory feedback_uuid_no_user_visibility.md) — bizNo 만 응답.
 */
@RestController
@RequestMapping("/api/v1/auth")
public class PartnerAuthController {

    private final PartnerAuthService partnerAuthService;
    private final AuditPublisher auditPublisher;
    private final Set<String> trustedGatewayAddresses;
    private final PartnerAuditClientIpResolver clientIpResolver;

    @Autowired
    public PartnerAuthController(PartnerAuthService partnerAuthService, AuditPublisher auditPublisher,
                                 @Value("${samhan.audit.trusted-gateway-addresses:}") String trustedGatewayAddresses) {
        this.partnerAuthService = partnerAuthService;
        this.auditPublisher = auditPublisher;
        this.trustedGatewayAddresses = parseAddresses(trustedGatewayAddresses);
        this.clientIpResolver = new PartnerAuditClientIpResolver(this.trustedGatewayAddresses);
    }

    /** 기존 단위 테스트와 수동 controller 생성자의 호환 생성자. */
    public PartnerAuthController(PartnerAuthService partnerAuthService, AuditPublisher auditPublisher) {
        this(partnerAuthService, auditPublisher, "");
    }

    public PartnerAuthController(PartnerAuthService partnerAuthService) {
        this(partnerAuthService, null, "");
    }

    /** 테스트 및 기존 호출부 호환용 신뢰 gateway 주소 생성자. */
    public PartnerAuthController(PartnerAuthService partnerAuthService, AuditPublisher auditPublisher,
                                 Set<String> trustedGatewayAddresses) {
        this.partnerAuthService = partnerAuthService;
        this.auditPublisher = auditPublisher;
        this.trustedGatewayAddresses = trustedGatewayAddresses == null ? Set.of() : Set.copyOf(trustedGatewayAddresses);
        this.clientIpResolver = new PartnerAuditClientIpResolver(this.trustedGatewayAddresses);
    }

    /** 1) 거래처 인증 상태 조회. */
    @GetMapping("/partner-status")
    public ApiResponse<CheckAuthStatusResponse> partnerStatus(@RequestParam("bizNo") String bizNo) {
        return ApiResponse.ok(partnerAuthService.checkStatus(bizNo));
    }

    /** 2) 거래처 가입 신청 — 201 PENDING. */
    @PostMapping("/partner-register")
    public ResponseEntity<ApiResponse<PartnerRegisterResponse>> partnerRegister(
            @Valid @RequestBody PartnerRegisterRequest request) {
        PartnerRegisterResponse body = partnerAuthService.register(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(body));
    }

    /** 3) 비밀번호 설정 / 변경. */
    @PatchMapping("/partner-password")
    public ApiResponse<SetPasswordResponse> partnerPassword(
            @Valid @RequestBody SetPasswordRequest request) {
        return ApiResponse.ok(partnerAuthService.setPassword(request));
    }

    /** 4) 거래처 로그인 — status + token + config (M3 RPC nested). */
    @PostMapping("/partner-login")
    public ApiResponse<TryLoginResponse> partnerLogin(
            @Valid @RequestBody TryLoginRequest request,
            HttpServletRequest httpRequest) {
        String ip = resolveClientIp(httpRequest);
        String ua = httpRequest.getHeader("User-Agent");
        TryLoginResponse response = partnerAuthService.tryLogin(request, ip, ua);
        boolean success = response.status() == com.samhanair.logis.partnerauth.domain.PartnerStatus.OK;
        if (auditPublisher != null) {
            auditPublisher.publishAfterCommit(AuditEventV2.authentication(
                    "partner-auth-service", success, "/api/v1/auth/partner-login", response.message(), ip, ua));
        }
        return ApiResponse.ok(response);
    }

    /** 5) 임시 비밀번호 발급 (sms-service 큐잉) — 202 Accepted. */
    @PostMapping("/partner-temp-password")
    public ResponseEntity<ApiResponse<TempPasswordResponse>> partnerTempPassword(
            @Valid @RequestBody TempPasswordRequest request) {
        TempPasswordResponse body = partnerAuthService.issueTempPassword(request);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(ApiResponse.ok(body));
    }

    /** 6) 30일 슬라이딩 만료 일시 조회. */
    @GetMapping("/partner-expiration")
    public ApiResponse<ExpirationResponse> partnerExpiration(@RequestParam("bizNo") String bizNo) {
        return ApiResponse.ok(partnerAuthService.getExpiration(bizNo));
    }

    /** 7) 튜토리얼 완료 표시 (PC | MOBILE). */
    @PatchMapping("/partner-tutorial")
    public ApiResponse<TutorialUpdateResponse> partnerTutorial(
            @Valid @RequestBody TutorialUpdateRequest request) {
        return ApiResponse.ok(partnerAuthService.updateTutorial(request));
    }

    /** 신뢰 gateway가 전달한 감사 전용 주소만 사용하고 직접 forwarding header는 무시한다. */
    private String resolveClientIp(HttpServletRequest req) {
        return resolveClientIp(req, trustedGatewayAddresses);
    }

    private String resolveClientIp(HttpServletRequest req, Set<String> trustedGateways) {
        return new PartnerAuditClientIpResolver(trustedGateways).resolve(req);
    }

    private static Set<String> parseAddresses(String addresses) {
        return Arrays.stream((addresses == null ? "" : addresses).split(","))
                .map(String::trim).filter(value -> !value.isBlank()).collect(Collectors.toUnmodifiableSet());
    }
}
