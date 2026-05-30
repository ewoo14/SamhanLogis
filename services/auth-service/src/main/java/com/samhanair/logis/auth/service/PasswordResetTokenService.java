package com.samhanair.logis.auth.service;

import com.samhanair.logis.auth.domain.Account;
import com.samhanair.logis.auth.domain.PasswordResetToken;
import com.samhanair.logis.auth.repository.AccountRepository;
import com.samhanair.logis.auth.repository.PasswordResetTokenRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * P0-2 비밀번호 셀프 재설정 서비스 — 6자리 인증번호 기반 (이메일 발송 mock).
 *
 * <p>출처: {@code docs/manual/00-시작하기/01-로그인.md §비밀번호 재설정 (셀프)}.
 *
 * <p>흐름:
 * <ol>
 *     <li>{@link #requestReset(String, String, String)} — loginId + email 교차 검증 →
 *         6자리 인증번호 생성 → SHA-256 해시 후 {@code password_reset_tokens} 테이블 INSERT →
 *         기존 미사용 토큰 일괄 무효화 → mock 이메일 발송 (console log)</li>
 *     <li>{@link #confirmReset(String, String, String, String)} — loginId + 인증번호 검증 →
 *         비밀번호 정책 검증 → confirmPassword 일치 검증 → BCrypt 해시 후 비밀번호 교체 →
 *         token used 마킹 → 잠금 해제</li>
 * </ol>
 *
 * <p>보안 정책:
 * <ul>
 *     <li>token 평문 DB 저장 금지 — SHA-256(HEX) 해시 저장</li>
 *     <li>토큰 만료 10 분</li>
 *     <li>재사용(used=true) 거부</li>
 *     <li>사용자 미존재/이메일 불일치 시 enumeration 방지 — 동일 응답 반환</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PasswordResetTokenService {

    private static final int CODE_DIGITS = 6;
    private static final int CODE_BOUND = 1_000_000; // 000000 ~ 999999

    private final AccountRepository accountRepository;
    private final PasswordResetTokenRepository tokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final NotificationStub notificationStub;
    private final SecureRandom secureRandom = new SecureRandom();

    /**
     * 비밀번호 재설정 인증번호 요청.
     *
     * <p>loginId 만 필수. email 이 전달되지 않으면 loginId 로 조회한 계정의 등록 이메일을 사용한다
     * (FE {@code passwordResetApi.ts} 계약 — "email 은 BE 가 loginId 로 자동 조회").
     * email 이 전달된 경우에는 등록 이메일과 교차 검증한다.
     *
     * <p>미존재/비활성/이메일 불일치 시에도 동일 응답 (enumeration 방지).
     * 유효한 사용자인 경우에만 인증번호 생성 + 이메일 발송.
     *
     * @param loginId   요청자 loginId (필수)
     * @param email     요청자가 입력한 이메일 (선택 — null/blank 면 등록 이메일 자동 조회)
     * @param clientIp  요청자 IP 주소 (감사 기록용)
     */
    @Transactional
    public void requestReset(String loginId, String email, String clientIp) {
        Optional<Account> opt = accountRepository.findByLoginId(loginId);
        if (opt.isEmpty()) {
            log.info("[PasswordResetToken] requestReset — 미존재 loginId={} (silent ok)", loginId);
            return;
        }

        Account account = opt.get();

        // 비활성 계정 — enumeration 방지를 위해 동일 응답
        if (!account.isEnabled()) {
            log.info("[PasswordResetToken] requestReset — 비활성 계정 loginId={} (silent ok)", loginId);
            return;
        }

        // 등록 이메일이 없으면 발송 불가 — enumeration 방지를 위해 동일 응답
        String registeredEmail = account.getEmail();
        if (registeredEmail == null || registeredEmail.isBlank()) {
            log.info("[PasswordResetToken] requestReset — 등록 이메일 없음 loginId={} (silent ok)", loginId);
            return;
        }

        // email 이 전달된 경우에만 교차 검증. 미전달(null/blank) 시 등록 이메일 자동 사용.
        boolean emailProvided = email != null && !email.isBlank();
        if (emailProvided && !registeredEmail.equalsIgnoreCase(email)) {
            log.info("[PasswordResetToken] requestReset — 이메일 불일치 loginId={} (silent ok)", loginId);
            return;
        }

        // 실제 발송 대상은 항상 DB 등록 이메일 (사용자 입력 신뢰 금지)
        String targetEmail = registeredEmail;

        // 기존 미사용 토큰 일괄 무효화 (재발급 시 기존 토큰 사용 불가)
        List<PasswordResetToken> oldTokens = tokenRepository.findByUserIdAndUsedFalse(account.getId());
        LocalDateTime now = LocalDateTime.now();
        for (PasswordResetToken old : oldTokens) {
            old.markDeleted("SYSTEM-REISSUE");
        }

        // 6자리 인증번호 생성 (000000 ~ 999999)
        String code = String.format("%0" + CODE_DIGITS + "d", secureRandom.nextInt(CODE_BOUND));
        String tokenHash = sha256Hex(code);

        LocalDateTime expiresAt = now.plusMinutes(PasswordResetToken.TTL_MINUTES);
        PasswordResetToken token = PasswordResetToken.create(account.getId(), tokenHash, expiresAt, clientIp);
        tokenRepository.save(token);

        notificationStub.sendPasswordResetCode(targetEmail, loginId, code, expiresAt.toString());
        log.info("[PasswordResetToken] requestReset — 인증번호 발급 완료 userId={} expiresAt={}",
                account.getId(), expiresAt);
    }

    /**
     * 비밀번호 재설정 confirm — 인증번호 검증 + 비밀번호 교체.
     *
     * @param loginId         요청자 loginId
     * @param token           6자리 숫자 인증번호 (raw — 해시 후 비교)
     * @param newPassword     새 비밀번호
     * @param confirmPassword 새 비밀번호 확인
     * @throws BusinessException UNAUTHORIZED (토큰 무효/만료/재사용), INVALID_INPUT (정책 위반/불일치)
     */
    @Transactional
    public void confirmReset(String loginId, String token, String newPassword, String confirmPassword) {
        // 1) 비밀번호 일치 검증
        if (!newPassword.equals(confirmPassword)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "새 비밀번호와 비밀번호 확인이 일치하지 않습니다");
        }

        // 2) 비밀번호 정책 검증
        PasswordPolicy.validate(newPassword);

        // 3) loginId 로 계정 조회
        Account account = accountRepository.findByLoginId(loginId)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.UNAUTHORIZED, "인증번호가 유효하지 않습니다"));

        // 4) token 해시로 PasswordResetToken 조회
        String tokenHash = sha256Hex(token);
        PasswordResetToken resetToken = tokenRepository.findByTokenHash(tokenHash)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.UNAUTHORIZED, "인증번호가 유효하지 않습니다"));

        // 5) userId 일치 검증 (다른 사람의 토큰 도용 방지)
        if (!resetToken.getUserId().equals(account.getId())) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "인증번호가 유효하지 않습니다");
        }

        // 6) 토큰 유효성 검증 (만료 + 재사용)
        LocalDateTime now = LocalDateTime.now();
        if (!resetToken.isValid(now)) {
            throw new BusinessException(
                    ErrorCode.UNAUTHORIZED,
                    resetToken.isUsed()
                            ? "이미 사용된 인증번호입니다"
                            : "인증번호가 만료되었습니다");
        }

        // 7) 비밀번호 교체
        String newHash = passwordEncoder.encode(newPassword);
        account.changePassword(newHash, now);

        // 8) 토큰 used 마킹
        resetToken.markUsed(now);

        log.info("[PasswordResetToken] confirmReset — 비밀번호 재설정 완료 userId={}", account.getId());
    }

    /**
     * SHA-256 해시 hex 문자열 반환.
     *
     * @param input 해시할 원문
     * @return SHA-256(input) hex 문자열 (소문자)
     */
    static String sha256Hex(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 알고리즘을 사용할 수 없습니다", e);
        }
    }
}
