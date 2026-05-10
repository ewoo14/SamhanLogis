package com.samhanair.logis.auth.service;

import com.samhanair.logis.auth.config.JwtIssueProperties;
import com.samhanair.logis.auth.domain.Account;
import com.samhanair.logis.auth.repository.AccountRepository;
import com.samhanair.logis.auth.service.dto.LoginResponse;
import com.samhanair.logis.auth.service.dto.RegisterResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.security.JwtTokenProvider;
import com.samhanair.logis.common.security.Role;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 인증 + 등록 use-case. 모든 오류는 {@link BusinessException} 으로 surface.
 *
 * <p>Phase 10 P0-2 갱신 — login 실패 시 {@link Account#incrementFailedLogin(LocalDateTime)} 으로
 * 카운터 증가 + 5 회 누적 시 자동 잠금. 잠긴 계정은 비밀번호 일치해도 거절.
 */
@Slf4j
@Service
@Transactional
@RequiredArgsConstructor
public class AuthService {

    private final AccountRepository accountRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtIssueProperties jwtIssueProperties;

    public LoginResponse login(String loginId, String rawPassword) {
        Account account = accountRepository.findByLoginId(loginId)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.UNAUTHORIZED, "아이디 또는 비밀번호가 올바르지 않습니다"));

        // P0-2 — 잠긴 계정은 비밀번호 일치 여부와 무관하게 즉시 거절 (계정 노출 최소화)
        if (account.isLocked()) {
            throw new BusinessException(
                    ErrorCode.UNAUTHORIZED, "계정이 잠겼습니다. 관리자에게 잠금 해제를 요청해주세요");
        }

        if (!account.isEnabled()) {
            throw new BusinessException(
                    ErrorCode.UNAUTHORIZED, "비활성화된 계정입니다. 관리자에게 문의해주세요");
        }

        if (!passwordEncoder.matches(rawPassword, account.getPasswordHash())) {
            boolean lockedNow = account.incrementFailedLogin(LocalDateTime.now());
            if (lockedNow) {
                log.warn("[AuthService] account locked due to repeated failures — loginId={}", loginId);
                throw new BusinessException(
                        ErrorCode.UNAUTHORIZED,
                        String.format("비밀번호 %d 회 연속 실패로 계정이 잠겼습니다. 관리자에게 문의해주세요",
                                Account.MAX_FAILED_LOGIN_ATTEMPTS));
            }
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "아이디 또는 비밀번호가 올바르지 않습니다");
        }

        account.markLogin(LocalDateTime.now());

        String userId = account.getId().toString();
        String role = account.getRole().name();
        String token = JwtTokenProvider.generate(
                userId, role, jwtIssueProperties.getTtlSeconds(), jwtIssueProperties.getSecretBytes());

        return new LoginResponse(token, userId, role, account.getDisplayName());
    }

    public RegisterResponse register(String loginId, String rawPassword, String displayName, Role role) {
        return registerWithId(UUID.randomUUID(), loginId, rawPassword, displayName, role);
    }

    /**
     * Provisioning entry-point used by the internal endpoint. Persists the account with
     * the caller-supplied {@code id} so the Auth and User services share the same
     * principal identifier.
     */
    public RegisterResponse registerWithId(
            UUID id, String loginId, String rawPassword, String displayName, Role role) {
        return registerWithId(id, loginId, rawPassword, displayName, role, false);
    }

    /**
     * 신규 직원 등록 — {@code passwordChangeRequired} 플래그 세팅 가능.
     *
     * <p>Phase 10 P0-5: MASTER 가 임시 비밀번호로 신규 직원을 등록할 때
     * {@code passwordChangeRequired = true} 로 호출하면 첫 로그인 후 비밀번호 변경이 강제됨.
     *
     * @param id                    User Service 가 선점한 UUID (auth-service 와 공유)
     * @param loginId               로그인 아이디
     * @param rawPassword           임시 비밀번호 (평문)
     * @param displayName           표시 이름
     * @param role                  초기 역할
     * @param passwordChangeRequired 첫 로그인 후 비밀번호 변경 강제 여부
     */
    public RegisterResponse registerWithId(
            UUID id, String loginId, String rawPassword, String displayName, Role role,
            boolean passwordChangeRequired) {
        if (accountRepository.existsByLoginId(loginId)) {
            throw new BusinessException(ErrorCode.CONFLICT, "이미 사용중인 아이디입니다");
        }

        String passwordHash = passwordEncoder.encode(rawPassword);
        Account account = Account.createWithId(id, loginId, passwordHash, displayName, role);
        if (passwordChangeRequired) {
            account.setPasswordChangeRequired(true);
        }
        accountRepository.save(account);

        return new RegisterResponse(account.getId().toString(), account.getLoginId(), account.getRole().name());
    }

    public void updateAccountRole(UUID id, Role role) {
        Account account = accountRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "계정을 찾을 수 없습니다"));
        account.changeRole(role);
    }

    public void updateAccountDisplayName(UUID id, String displayName) {
        Account account = accountRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "계정을 찾을 수 없습니다"));
        account.changeDisplayName(displayName);
    }

    public void disableAccount(UUID id, String operatorId) {
        Account account = accountRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "계정을 찾을 수 없습니다"));
        account.disable();
        account.markDeleted(operatorId);
    }

    public void deleteAccount(UUID id) {
        Account account = accountRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "계정을 찾을 수 없습니다"));
        account.disable();
        account.markDeleted("system-internal");
    }

    /**
     * 계정 잠금 해제 — MASTER 가 관리 화면에서 호출.
     *
     * <p>Phase 10 P0-5: {@link Account#unlock()} 위임 ({@code lockedAt = null},
     * {@code failedLoginAttempts = 0}). 이미 잠금이 아닌 계정에 대해 호출해도 멱등 처리.
     *
     * @param id 잠금 해제할 계정 UUID
     */
    public void unlockAccount(UUID id) {
        Account account = accountRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "계정을 찾을 수 없습니다"));
        account.unlock();
        log.info("[AuthService] account unlocked — id={}", id);
    }
}
