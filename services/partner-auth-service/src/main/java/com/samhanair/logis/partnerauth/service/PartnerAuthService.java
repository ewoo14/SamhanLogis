package com.samhanair.logis.partnerauth.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.security.JwtTokenProvider;
import com.samhanair.logis.partnerauth.client.DcConfigClient;
import com.samhanair.logis.partnerauth.client.PartnerConfigDto;
import com.samhanair.logis.partnerauth.client.SmsClient;
import com.samhanair.logis.partnerauth.config.PartnerAuthJwtProperties;
import com.samhanair.logis.partnerauth.domain.LoginAttemptResult;
import com.samhanair.logis.partnerauth.domain.PartnerAuth;
import com.samhanair.logis.partnerauth.domain.PartnerLoginAttempt;
import com.samhanair.logis.partnerauth.domain.PartnerSession;
import com.samhanair.logis.partnerauth.domain.PartnerStatus;
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
import com.samhanair.logis.partnerauth.repository.PartnerAuthRepository;
import com.samhanair.logis.partnerauth.repository.PartnerLoginAttemptRepository;
import com.samhanair.logis.partnerauth.repository.PartnerSessionRepository;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Partner Auth Service — 7 endpoint 비즈니스 로직 (legacy 100% 보존).
 *
 * <p><b>핵심 비즈니스 규칙 (Code.js 매핑):</b>
 * <ul>
 *   <li>3회 연속 실패 → LOCKED ({@link PartnerAuth#FAIL_LOCK_THRESHOLD}, Code.js:2847)</li>
 *   <li>30일 미사용 → LONG_UNUSED ({@link PartnerAuth#LONG_UNUSED_DAYS}, Code.js:2957)</li>
 *   <li>password_history 5건 FIFO 검사 ({@link PartnerAuth#PASSWORD_HISTORY_SIZE})</li>
 *   <li>DelegatingPasswordEncoder = BCrypt + legacy SHA-256 동시 호환</li>
 * </ul>
 */
@Service
@Transactional
@RequiredArgsConstructor
public class PartnerAuthService {

    private static final Logger log = LoggerFactory.getLogger(PartnerAuthService.class);
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int PIN_BOUND = 10_000;
    private static final int PASSWORD_RESET_RATE_LIMIT = 3;
    private static final long PASSWORD_RESET_WINDOW_MINUTES = 15;
    private static final String ADMIN_RESET_PLACEHOLDER_HASH = "{noop}TEMP-RESET";

    private final PartnerAuthRepository authRepository;
    private final PartnerLoginAttemptRepository attemptRepository;
    private final PartnerSessionRepository sessionRepository;
    private final PasswordEncoder passwordEncoder;
    private final PartnerAuthJwtProperties jwtProperties;
    private final DcConfigClient dcConfigClient;
    private final SmsClient smsClient;
    private final PartnerActivityReader partnerActivityReader;
    private final Map<String, RateLimitBucket> passwordResetRateLimits = new ConcurrentHashMap<>();

    // ─────────────────────────────────────────────────────────────────────
    // 1) GET /api/v1/auth/partner-status
    // ─────────────────────────────────────────────────────────────────────
    @Transactional(readOnly = true)
    public CheckAuthStatusResponse checkStatus(String bizNo) {
        Optional<PartnerConfigDto> config = dcConfigClient.findByBizNo(bizNo);
        Optional<PartnerAuth> authOpt = authRepository.findByBizNo(bizNo);

        if (config.isEmpty() && authOpt.isEmpty()) {
            return new CheckAuthStatusResponse(bizNo, PartnerStatus.NOT_FOUND_SYSTEM, null,
                    "시스템에 등록되지 않은 거래처입니다");
        }
        if (authOpt.isEmpty()) {
            return new CheckAuthStatusResponse(bizNo, PartnerStatus.NOT_FOUND_AUTH,
                    config.map(PartnerConfigDto::partnerName).orElse(null),
                    "인증 정보가 없습니다 — 가입 신청 필요");
        }

        PartnerAuth auth = authOpt.get();
        PartnerStatus effective = evaluateEffectiveStatus(auth);
        return new CheckAuthStatusResponse(bizNo, effective,
                config.map(PartnerConfigDto::partnerName).orElse(null),
                statusMessage(effective));
    }

    /**
     * entity status + 30일 슬라이딩 만료 평가 — 마킹은 별도 트랜잭션 (readOnly=true 안전성).
     */
    private PartnerStatus evaluateEffectiveStatus(PartnerAuth auth) {
        if (auth.getStatus() == PartnerStatus.LOCKED || auth.getStatus() == PartnerStatus.ACCESS_DENIED
                || auth.getStatus() == PartnerStatus.PENDING || auth.getStatus() == PartnerStatus.NEED_PW_SET) {
            return auth.getStatus();
        }
        if (auth.getStatus() == PartnerStatus.LONG_UNUSED) {
            return PartnerStatus.LONG_UNUSED;
        }
        PartnerActivity activity = PartnerAccessPolicy.readSafely(partnerActivityReader, auth.getPartnerCode());
        if (PartnerAccessPolicy.isAuthenticationLongUnused(auth, activity, LocalDateTime.now())) {
            return PartnerStatus.LONG_UNUSED;
        }
        return auth.getStatus();
    }

    private String statusMessage(PartnerStatus status) {
        return switch (status) {
            case PENDING -> "가입 승인 대기중";
            case LOCKED -> "비밀번호 3회 연속 실패로 계정이 잠겼습니다";
            case LONG_UNUSED -> "30일 이상 미사용으로 만료되었습니다";
            case ACCESS_DENIED -> "관리자에 의해 차단되었습니다";
            case PW_EXPIRED -> "비밀번호 변경이 필요합니다";
            case NEED_PW_SET -> "본 비밀번호 설정이 필요합니다";
            case NEED_PW_INPUT -> "비밀번호를 입력하세요";
            case OK -> "정상";
            case NOT_FOUND_AUTH -> "인증 정보 없음";
            case NOT_FOUND_SYSTEM -> "등록되지 않은 거래처";
        };
    }

    // ─────────────────────────────────────────────────────────────────────
    // 2) POST /api/v1/auth/partner-register
    // ─────────────────────────────────────────────────────────────────────
    public PartnerRegisterResponse register(PartnerRegisterRequest req) {
        String bizNo = normalizeBizNo(req.bizNo());
        if (authRepository.existsByBizNo(bizNo)) {
            throw new BusinessException(ErrorCode.CONFLICT, "이미 가입 신청된 거래처입니다");
        }
        String partnerCode = derivePartnerCodeFromBizNo(bizNo);
        PartnerAuth saved = authRepository.save(
                PartnerAuth.register(bizNo, partnerCode, req.memo()));
        return new PartnerRegisterResponse(saved.getBizNo(), saved.getStatus(), "가입 신청이 접수되었습니다");
    }

    // ─────────────────────────────────────────────────────────────────────
    // 3) PATCH /api/v1/auth/partner-password
    // ─────────────────────────────────────────────────────────────────────
    public SetPasswordResponse setPassword(SetPasswordRequest req) {
        PartnerAuth auth = authRepository.findByBizNo(req.bizNo())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "거래처를 찾을 수 없습니다"));

        if (auth.getStatus() == PartnerStatus.PENDING) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "관리자 승인 전에는 비밀번호를 설정할 수 없습니다");
        }

        // 임시 PIN 이 저장된 NEED_PW_SET 은 등록 연락처 수신자가 입력한 PIN 을 현재 비밀번호로 검증한다.
        if (requiresPossessionFactor(auth)) {
            assertPasswordResetRateLimit(req.bizNo(), "password-reset-confirm");
            if (req.currentPassword() == null || req.currentPassword().isBlank()) {
                throw new BusinessException(ErrorCode.UNAUTHORIZED, "임시 비밀번호를 입력해주세요");
            }
            if (!passwordEncoder.matches(req.currentPassword(), auth.getPasswordHash())) {
                throw new BusinessException(ErrorCode.UNAUTHORIZED, "임시 비밀번호가 올바르지 않습니다");
            }
        } else if (auth.getStatus() != PartnerStatus.NEED_PW_SET) {
            // 일반 변경은 현재 비밀번호를 검증한다. 승인 직후 NEED_PW_SET(passwordHash 없음)은 최초 설정이므로 예외.
            if (req.currentPassword() == null || req.currentPassword().isBlank()) {
                throw new BusinessException(ErrorCode.INVALID_INPUT, "현재 비밀번호를 입력해주세요");
            }
            if (!passwordEncoder.matches(req.currentPassword(), auth.getPasswordHash())) {
                throw new BusinessException(ErrorCode.UNAUTHORIZED, "현재 비밀번호가 올바르지 않습니다");
            }
        }

        // password_history 5건 FIFO 재사용 차단
        if (auth.getPasswordHash() != null
                && passwordEncoder.matches(req.newPassword(), auth.getPasswordHash())) {
            return new SetPasswordResponse("USED_PW", "직전 비밀번호와 동일합니다");
        }
        for (String oldHash : auth.getPasswordHistoryView()) {
            if (passwordEncoder.matches(req.newPassword(), oldHash)) {
                return new SetPasswordResponse("USED_PW", "최근 5회 사용한 비밀번호는 재사용할 수 없습니다");
            }
        }

        String newHash = passwordEncoder.encode(req.newPassword());
        auth.changePassword(newHash);
        return new SetPasswordResponse("OK", "비밀번호가 설정되었습니다");
    }

    // ─────────────────────────────────────────────────────────────────────
    // 4) POST /api/v1/auth/partner-login
    // ─────────────────────────────────────────────────────────────────────
    public TryLoginResponse tryLogin(TryLoginRequest req, String clientIp, String userAgent) {
        PartnerAuth auth = authRepository.findByBizNo(req.bizNo()).orElse(null);
        if (auth == null) {
            attemptRepository.save(PartnerLoginAttempt.of(
                    null, req.bizNo(), LoginAttemptResult.FAIL_NOT_FOUND, clientIp, userAgent, req.mobile()));
            return new TryLoginResponse(PartnerStatus.NOT_FOUND_AUTH, null, null, "인증 정보가 없습니다");
        }

        // 30일 슬라이딩 만료 평가 (readOnly=false → write back 허용)
        PartnerStatus effective = evaluateEffectiveStatus(auth);
        if (effective == PartnerStatus.LONG_UNUSED && auth.getStatus() != PartnerStatus.LONG_UNUSED) {
            auth.markLongUnused();
        }

        // 차단 status 우선 응답
        switch (effective) {
            case LOCKED -> {
                attemptRepository.save(PartnerLoginAttempt.of(
                        auth.getId(), req.bizNo(), LoginAttemptResult.FAIL_LOCKED, clientIp, userAgent, req.mobile()));
                return new TryLoginResponse(PartnerStatus.LOCKED, null, null, "계정이 잠겼습니다");
            }
            case LONG_UNUSED -> {
                attemptRepository.save(PartnerLoginAttempt.of(
                        auth.getId(), req.bizNo(), LoginAttemptResult.FAIL_LONG_UNUSED, clientIp, userAgent, req.mobile()));
                return new TryLoginResponse(PartnerStatus.LONG_UNUSED, null, null, "30일 이상 미사용으로 만료되었습니다");
            }
            case ACCESS_DENIED -> {
                attemptRepository.save(PartnerLoginAttempt.of(
                        auth.getId(), req.bizNo(), LoginAttemptResult.FAIL_ACCESS_DENIED, clientIp, userAgent, req.mobile()));
                return new TryLoginResponse(PartnerStatus.ACCESS_DENIED, null, null, "관리자에 의해 차단되었습니다");
            }
            case PENDING, NEED_PW_SET -> {
                attemptRepository.save(PartnerLoginAttempt.of(
                        auth.getId(), req.bizNo(), LoginAttemptResult.FAIL_NOT_FOUND, clientIp, userAgent, req.mobile()));
                return new TryLoginResponse(effective, null, null, "비밀번호 설정이 필요합니다");
            }
            default -> {
                // continue
            }
        }

        // 비밀번호 검증
        if (auth.getPasswordHash() == null
                || !passwordEncoder.matches(req.password(), auth.getPasswordHash())) {
            auth.markLoginFailure();
            attemptRepository.save(PartnerLoginAttempt.of(
                    auth.getId(), req.bizNo(), LoginAttemptResult.FAIL_BAD_PASSWORD,
                    clientIp, userAgent, req.mobile()));
            PartnerStatus afterFail = auth.getStatus(); // markLoginFailure 가 LOCKED 마킹
            return new TryLoginResponse(afterFail, null, null,
                    afterFail == PartnerStatus.LOCKED
                            ? "비밀번호 3회 연속 실패로 계정이 잠겼습니다"
                            : "비밀번호가 올바르지 않습니다 (실패 " + auth.getFailedAttempts() + "회)");
        }

        // 로그인 성공
        auth.markLoginSuccess(LocalDateTime.now());
        attemptRepository.save(PartnerLoginAttempt.of(
                auth.getId(), req.bizNo(), LoginAttemptResult.SUCCESS, clientIp, userAgent, req.mobile()));

        // JWT 발급 + session 저장
        // Phase C5-4: role 클레임 제거, partnerCode claim 으로 파트너 신원 식별.
        // api-gateway 가 partnerCode claim 존재 시 X-Is-Partner: true 헤더를 주입하여
        // PermissionAspect 의 PARTNER 거절 판정에 사용된다.
        String jti = UUID.randomUUID().toString();
        String token = JwtTokenProvider.generateForPartner(
                auth.getId().toString(),
                auth.getPartnerCode(),
                jwtProperties.getExpirationSeconds(),
                jwtProperties.getSecretBytes());
        LocalDateTime now = LocalDateTime.now();
        sessionRepository.save(PartnerSession.issue(
                jti, auth.getId(), req.bizNo(), now,
                now.plusHours(jwtProperties.getExpirationHours()), clientIp));

        // M3 RPC 결과 (config nested)
        PartnerConfigDto config = dcConfigClient.findByBizNo(req.bizNo()).orElse(null);
        return new TryLoginResponse(PartnerStatus.OK, token, config, "로그인 성공");
    }

    // ─────────────────────────────────────────────────────────────────────
    // 5) POST /api/v1/auth/partner-temp-password
    // ─────────────────────────────────────────────────────────────────────
    public TempPasswordResponse issueTempPassword(TempPasswordRequest req) {
        PartnerAuth auth = authRepository.findByBizNo(req.bizNo())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "거래처를 찾을 수 없습니다"));
        if (auth.getStatus() == PartnerStatus.PENDING) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "관리자 승인 전에는 임시 비밀번호를 발급할 수 없습니다");
        }

        assertPasswordResetRateLimit(auth.getBizNo(), "temp-password");
        PartnerConfigDto config = dcConfigClient.findByBizNo(auth.getBizNo())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "등록 연락처를 찾을 수 없습니다"));
        String registeredMobileNo = trimToNull(config.mobileNo());
        if (registeredMobileNo == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "등록 연락처가 없어 임시 비밀번호를 발급할 수 없습니다");
        }

        String tempPlain = generateTempPassword();
        auth.issueTempPassword(passwordEncoder.encode(tempPlain));
        smsClient.enqueuePasswordResetAttemptNotice(registeredMobileNo);
        smsClient.enqueueTempPassword(registeredMobileNo, tempPlain);
        log.info("PartnerAuth password reset requested: bizNo={}, status={}, registeredMobileMasked={}",
                auth.getBizNo(), auth.getStatus(), maskMobileNo(registeredMobileNo));

        return new TempPasswordResponse(
                "임시 비밀번호가 SMS 로 발송되었습니다 (sms-service 큐잉)",
                maskMobileNo(registeredMobileNo));
    }

    private String generateTempPassword() {
        // BizGate 거래처 비밀번호 정책과 동일하게 임시 비밀번호도 숫자 4자리 PIN 으로 발급한다.
        return String.format("%04d", RANDOM.nextInt(PIN_BOUND));
    }

    private String maskMobileNo(String mobileNo) {
        if (mobileNo == null || mobileNo.length() < 7) {
            return "***";
        }
        int len = mobileNo.length();
        return mobileNo.substring(0, 3) + "****" + mobileNo.substring(len - 4);
    }

    /**
     * 자가등록 요청의 {@code partnerCode} 는 공격자 입력이므로 저장하지 않는다.
     * 검증된 사업자번호 숫자만으로 서버가 partnerCode 를 파생한다.
     */
    private String derivePartnerCodeFromBizNo(String bizNo) {
        return bizNo;
    }

    private String normalizeBizNo(String bizNo) {
        String digits = bizNo == null ? "" : bizNo.replaceAll("\\D", "");
        if (digits.length() < 10 || digits.length() > 12) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "bizNo 는 10~12자 숫자만 허용합니다");
        }
        return digits;
    }

    private boolean requiresPossessionFactor(PartnerAuth auth) {
        return auth.getStatus() == PartnerStatus.NEED_PW_SET
                && auth.getPasswordHash() != null
                && !ADMIN_RESET_PLACEHOLDER_HASH.equals(auth.getPasswordHash());
    }

    private void assertPasswordResetRateLimit(String bizNo, String action) {
        LocalDateTime now = LocalDateTime.now();
        String key = action + ":" + normalizeBizNo(bizNo);
        RateLimitBucket bucket = passwordResetRateLimits.compute(key, (ignored, current) -> {
            if (current == null || current.windowStartedAt.plusMinutes(PASSWORD_RESET_WINDOW_MINUTES).isBefore(now)) {
                return new RateLimitBucket(now, 1);
            }
            return new RateLimitBucket(current.windowStartedAt, current.count + 1);
        });
        if (bucket.count > PASSWORD_RESET_RATE_LIMIT) {
            throw new BusinessException(ErrorCode.TOO_MANY_REQUESTS,
                    "비밀번호 재설정 요청이 너무 많습니다. 잠시 후 다시 시도해주세요");
        }
    }

    private String trimToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private record RateLimitBucket(LocalDateTime windowStartedAt, int count) {}

    // ─────────────────────────────────────────────────────────────────────
    // 6) GET /api/v1/auth/partner-expiration
    // ─────────────────────────────────────────────────────────────────────
    @Transactional(readOnly = true)
    public ExpirationResponse getExpiration(String bizNo) {
        PartnerAuth auth = authRepository.findByBizNo(bizNo)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "거래처를 찾을 수 없습니다"));
        PartnerActivity activity = PartnerAccessPolicy.readSafely(partnerActivityReader, auth.getPartnerCode());
        LocalDateTime expiresAt = PartnerAccessPolicy.authenticationExpirationAt(auth, activity);
        if (expiresAt == null) {
            return new ExpirationResponse(bizNo, null, false, PartnerAuth.LONG_UNUSED_DAYS);
        }
        LocalDateTime now = LocalDateTime.now();
        boolean expired = expiresAt.isBefore(now);
        long remaining = expired ? 0 : ChronoUnit.DAYS.between(now, expiresAt);
        return new ExpirationResponse(bizNo, expiresAt, expired, remaining);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 7) PATCH /api/v1/auth/partner-tutorial
    // ─────────────────────────────────────────────────────────────────────
    public TutorialUpdateResponse updateTutorial(TutorialUpdateRequest req) {
        PartnerAuth auth = authRepository.findByBizNo(req.bizNo())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "거래처를 찾을 수 없습니다"));
        if (req.done()) {
            if ("PC".equals(req.platform())) {
                auth.completePcTutorial();
            } else {
                auth.completeMobileTutorial();
            }
        }
        return new TutorialUpdateResponse(
                auth.getBizNo(), auth.isTutorialPcDone(), auth.isTutorialMobileDone());
    }
}
