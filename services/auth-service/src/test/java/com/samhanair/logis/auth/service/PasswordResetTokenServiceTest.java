package com.samhanair.logis.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.auth.domain.Account;
import com.samhanair.logis.auth.domain.PasswordResetToken;
import com.samhanair.logis.auth.repository.AccountRepository;
import com.samhanair.logis.auth.repository.PasswordResetTokenRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.security.Role;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * P0-2 비밀번호 셀프 재설정 — {@link PasswordResetTokenService} 8 시나리오.
 *
 * <p>@MockitoSettings(LENIENT) — 일부 stub 이 모든 테스트에서 사용되지 않으므로 strictness 완화.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PasswordResetTokenServiceTest {

    @Mock
    private AccountRepository accountRepository;

    @Mock
    private PasswordResetTokenRepository tokenRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private NotificationStub notificationStub;

    @InjectMocks
    private PasswordResetTokenService service;

    private Account activeAccount;
    private UUID userId;

    @BeforeEach
    void setUp() {
        userId = UUID.randomUUID();
        activeAccount = Account.create("alice", "$2a$current", "Alice", Role.MANAGER);
        ReflectionTestUtils.setField(activeAccount, "id", userId);
        ReflectionTestUtils.setField(activeAccount, "email", "alice@samhan.com");

        // tokenRepository.save 기본 stub — 저장된 엔티티 그대로 반환
        when(tokenRepository.save(any(PasswordResetToken.class)))
                .thenAnswer(inv -> inv.getArgument(0));
        when(tokenRepository.findByUserIdAndUsedFalse(any()))
                .thenReturn(Collections.emptyList());
    }

    // ---------------------------------------------------------------
    // 시나리오 1: requestReset — 정상 요청
    // ---------------------------------------------------------------

    @Test
    @DisplayName("requestReset — 유효한 loginId+email 로 인증번호 발급 및 이메일 발송")
    void requestReset_validUser_issuesTokenAndSendsCode() {
        when(accountRepository.findByLoginId("alice")).thenReturn(Optional.of(activeAccount));

        service.requestReset("alice", "alice@samhan.com", "127.0.0.1");

        ArgumentCaptor<PasswordResetToken> tokenCaptor =
                ArgumentCaptor.forClass(PasswordResetToken.class);
        verify(tokenRepository).save(tokenCaptor.capture());

        PasswordResetToken saved = tokenCaptor.getValue();
        assertThat(saved.getUserId()).isEqualTo(userId);
        assertThat(saved.getTokenHash()).isNotBlank();
        assertThat(saved.getExpiresAt()).isAfter(LocalDateTime.now());
        assertThat(saved.isUsed()).isFalse();

        verify(notificationStub).sendPasswordResetCode(
                eq("alice@samhan.com"), eq("alice"), anyString(), anyString());
    }

    // ---------------------------------------------------------------
    // 시나리오 2: requestReset — 미존재 loginId 는 silent ok
    // ---------------------------------------------------------------

    @Test
    @DisplayName("requestReset — 미존재 loginId 는 enumeration 방지를 위해 조용히 반환")
    void requestReset_unknownLoginId_silentlyReturns() {
        when(accountRepository.findByLoginId("ghost")).thenReturn(Optional.empty());

        service.requestReset("ghost", "ghost@samhan.com", "127.0.0.1");

        verify(tokenRepository, never()).save(any());
        verify(notificationStub, never()).sendPasswordResetCode(any(), any(), any(), any());
    }

    // ---------------------------------------------------------------
    // 시나리오 3: requestReset — 이메일 불일치 시 silent ok
    // ---------------------------------------------------------------

    @Test
    @DisplayName("requestReset — 이메일 불일치 시 enumeration 방지 silent 반환")
    void requestReset_emailMismatch_silentlyReturns() {
        when(accountRepository.findByLoginId("alice")).thenReturn(Optional.of(activeAccount));

        service.requestReset("alice", "wrong@samhan.com", "127.0.0.1");

        verify(tokenRepository, never()).save(any());
        verify(notificationStub, never()).sendPasswordResetCode(any(), any(), any(), any());
    }

    // ---------------------------------------------------------------
    // 시나리오 4: requestReset — 비활성 계정 silent ok
    // ---------------------------------------------------------------

    @Test
    @DisplayName("requestReset — 비활성 계정은 silent 반환")
    void requestReset_disabledAccount_silentlyReturns() {
        activeAccount.disable();
        when(accountRepository.findByLoginId("alice")).thenReturn(Optional.of(activeAccount));

        service.requestReset("alice", "alice@samhan.com", "127.0.0.1");

        verify(tokenRepository, never()).save(any());
    }

    // ---------------------------------------------------------------
    // 시나리오 5: confirmReset — 정상 검증 + 비밀번호 교체 + 잠금 해제
    // ---------------------------------------------------------------

    @Test
    @DisplayName("confirmReset — 유효한 인증번호로 비밀번호 재설정 및 잠금 해제")
    void confirmReset_validToken_changesPasswordAndResetsLock() {
        // 잠금 상태 설정
        ReflectionTestUtils.setField(activeAccount, "failedLoginAttempts", 5);
        ReflectionTestUtils.setField(activeAccount, "lockedAt", LocalDateTime.now().minusMinutes(1));

        String code = "123456";
        String tokenHash = PasswordResetTokenService.sha256Hex(code);
        PasswordResetToken resetToken = PasswordResetToken.create(
                userId, tokenHash, LocalDateTime.now().plusMinutes(5), "127.0.0.1");
        ReflectionTestUtils.setField(resetToken, "id", UUID.randomUUID());

        when(accountRepository.findByLoginId("alice")).thenReturn(Optional.of(activeAccount));
        when(tokenRepository.findByTokenHash(tokenHash)).thenReturn(Optional.of(resetToken));
        when(passwordEncoder.matches(anyString(), anyString())).thenReturn(false);
        when(passwordEncoder.encode("NewPass1!")).thenReturn("$2a$new");

        service.confirmReset("alice", code, "NewPass1!", "NewPass1!");

        assertThat(activeAccount.getPasswordHash()).isEqualTo("$2a$new");
        assertThat(activeAccount.isLocked()).isFalse();
        assertThat(activeAccount.getFailedLoginAttempts()).isZero();
        assertThat(resetToken.isUsed()).isTrue();
        assertThat(resetToken.getUsedAt()).isNotNull();
    }

    // ---------------------------------------------------------------
    // 시나리오 6: confirmReset — 만료 토큰 거부
    // ---------------------------------------------------------------

    @Test
    @DisplayName("confirmReset — 만료된 인증번호는 UNAUTHORIZED")
    void confirmReset_expiredToken_throwsUnauthorized() {
        String code = "654321";
        String tokenHash = PasswordResetTokenService.sha256Hex(code);
        PasswordResetToken expiredToken = PasswordResetToken.create(
                userId, tokenHash, LocalDateTime.now().minusMinutes(1), "127.0.0.1");
        ReflectionTestUtils.setField(expiredToken, "id", UUID.randomUUID());

        when(accountRepository.findByLoginId("alice")).thenReturn(Optional.of(activeAccount));
        when(tokenRepository.findByTokenHash(tokenHash)).thenReturn(Optional.of(expiredToken));
        when(passwordEncoder.matches(anyString(), anyString())).thenReturn(false);

        assertThatThrownBy(() -> service.confirmReset("alice", code, "NewPass1!", "NewPass1!"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.UNAUTHORIZED));

        // 비밀번호 미변경
        assertThat(activeAccount.getPasswordHash()).isEqualTo("$2a$current");
    }

    // ---------------------------------------------------------------
    // 시나리오 7: confirmReset — 재사용 토큰 거부
    // ---------------------------------------------------------------

    @Test
    @DisplayName("confirmReset — 이미 사용된 인증번호는 UNAUTHORIZED")
    void confirmReset_usedToken_throwsUnauthorized() {
        String code = "111111";
        String tokenHash = PasswordResetTokenService.sha256Hex(code);
        PasswordResetToken usedToken = PasswordResetToken.create(
                userId, tokenHash, LocalDateTime.now().plusMinutes(5), "127.0.0.1");
        usedToken.markUsed(LocalDateTime.now().minusSeconds(30));
        ReflectionTestUtils.setField(usedToken, "id", UUID.randomUUID());

        when(accountRepository.findByLoginId("alice")).thenReturn(Optional.of(activeAccount));
        when(tokenRepository.findByTokenHash(tokenHash)).thenReturn(Optional.of(usedToken));
        when(passwordEncoder.matches(anyString(), anyString())).thenReturn(false);

        assertThatThrownBy(() -> service.confirmReset("alice", code, "NewPass1!", "NewPass1!"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.UNAUTHORIZED));
    }

    // ---------------------------------------------------------------
    // 시나리오 8: confirmReset — 비밀번호 정책 위반
    // ---------------------------------------------------------------

    @Test
    @DisplayName("confirmReset — 비밀번호 정책 위반 시 INVALID_INPUT")
    void confirmReset_weakPassword_throwsInvalidInput() {
        when(accountRepository.findByLoginId("alice")).thenReturn(Optional.of(activeAccount));

        assertThatThrownBy(() -> service.confirmReset("alice", "123456", "weak", "weak"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
    }

    // ---------------------------------------------------------------
    // 시나리오 9: confirmReset — confirmPassword 불일치
    // ---------------------------------------------------------------

    @Test
    @DisplayName("confirmReset — newPassword 와 confirmPassword 불일치 시 INVALID_INPUT")
    void confirmReset_passwordMismatch_throwsInvalidInput() {
        when(accountRepository.findByLoginId("alice")).thenReturn(Optional.of(activeAccount));

        assertThatThrownBy(() ->
                service.confirmReset("alice", "123456", "NewPass1!", "DifferentPass1!"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
    }

    // ---------------------------------------------------------------
    // 시나리오 10: requestReset — 재발급 시 기존 미사용 토큰 무효화
    // ---------------------------------------------------------------

    @Test
    @DisplayName("requestReset — 재발급 시 기존 미사용 토큰 soft-delete 처리")
    void requestReset_reissue_invalidatesOldTokens() {
        PasswordResetToken oldToken = PasswordResetToken.create(
                userId, "oldhash", LocalDateTime.now().plusMinutes(3), "127.0.0.1");
        ReflectionTestUtils.setField(oldToken, "id", UUID.randomUUID());

        when(accountRepository.findByLoginId("alice")).thenReturn(Optional.of(activeAccount));
        when(tokenRepository.findByUserIdAndUsedFalse(userId)).thenReturn(List.of(oldToken));

        service.requestReset("alice", "alice@samhan.com", "127.0.0.1");

        // 기존 토큰이 soft-delete 되었는지 검증
        assertThat(oldToken.getIsDeleted()).isTrue();
    }

    // ---------------------------------------------------------------
    // sha256Hex — 단위 검증
    // ---------------------------------------------------------------

    @Test
    @DisplayName("sha256Hex — 동일 입력은 항상 동일 해시 반환")
    void sha256Hex_deterministic() {
        String hash1 = PasswordResetTokenService.sha256Hex("123456");
        String hash2 = PasswordResetTokenService.sha256Hex("123456");
        assertThat(hash1).isEqualTo(hash2).hasSize(64); // SHA-256 hex = 64 chars
    }
}
