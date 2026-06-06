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
import com.samhanair.logis.auth.repository.AccountRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Phase 10 P0-2 — PasswordResetService 4 시나리오 (정책 / 잠금 / reuse / 만료).
 */
@ExtendWith(MockitoExtension.class)
class PasswordResetServiceTest {

    @Mock
    private AccountRepository accountRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private NotificationStub notificationStub;

    @InjectMocks
    private PasswordResetService passwordResetService;

    private Account managerAccount;
    private UUID managerId;

    @BeforeEach
    void setUp() {
        // C5-5: Account.create 에 role 파라미터 없음 — accounts.role 컬럼 DROP(V46)
        managerAccount = Account.create("alice", "$2a$current", "Alice");
        managerId = UUID.randomUUID();
        ReflectionTestUtils.setField(managerAccount, "id", managerId);
    }

    // ------------------------------------------------------------------
    // requestReset
    // ------------------------------------------------------------------

    @Test
    void requestReset_unknownLoginId_silentlyReturns() {
        when(accountRepository.findByLoginId("ghost")).thenReturn(Optional.empty());

        passwordResetService.requestReset("ghost", "g@samhan.com");

        verify(notificationStub, never()).sendPasswordResetEmail(any(), any(), any(), any());
    }

    @Test
    void requestReset_validUser_issuesTokenAndSendsEmail() {
        when(accountRepository.findByLoginId("alice")).thenReturn(Optional.of(managerAccount));

        passwordResetService.requestReset("alice", "alice@samhan.com");

        assertThat(managerAccount.getPasswordResetToken()).isNotBlank();
        assertThat(managerAccount.getPasswordResetTokenExpiresAt()).isAfter(LocalDateTime.now());
        verify(notificationStub).sendPasswordResetEmail(
                eq("alice@samhan.com"), eq("alice"), anyString(), anyString());
    }

    @Test
    void requestReset_disabledUser_silentlyReturns() {
        managerAccount.disable();
        when(accountRepository.findByLoginId("alice")).thenReturn(Optional.of(managerAccount));

        passwordResetService.requestReset("alice", "alice@samhan.com");

        assertThat(managerAccount.getPasswordResetToken()).isNull();
        verify(notificationStub, never()).sendPasswordResetEmail(any(), any(), any(), any());
    }

    @Test
    void requestReset_blankInput_throwsInvalidInput() {
        assertThatThrownBy(() -> passwordResetService.requestReset("", "e@s.com"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
    }

    // ------------------------------------------------------------------
    // confirmReset — 만료 시나리오
    // ------------------------------------------------------------------

    @Test
    void confirmReset_validToken_changesPasswordAndClearsToken() {
        String token = UUID.randomUUID().toString();
        managerAccount.issueResetToken(token, LocalDateTime.now().plusMinutes(10));
        when(accountRepository.findByPasswordResetToken(token)).thenReturn(Optional.of(managerAccount));
        when(passwordEncoder.matches(anyString(), anyString())).thenReturn(false);
        when(passwordEncoder.encode("NewPass1!")).thenReturn("$2a$new");

        passwordResetService.confirmReset(token, "NewPass1!");

        assertThat(managerAccount.getPasswordHash()).isEqualTo("$2a$new");
        assertThat(managerAccount.getPasswordResetToken()).isNull();
        assertThat(managerAccount.getPasswordChangedAt()).isNotNull();
        assertThat(managerAccount.getPasswordHistorySnapshot()).contains("$2a$current");
    }

    @Test
    void confirmReset_expiredToken_throwsUnauthorized() {
        String token = UUID.randomUUID().toString();
        // 만료 — 1 분 전에 expire
        managerAccount.issueResetToken(token, LocalDateTime.now().minusMinutes(1));
        when(accountRepository.findByPasswordResetToken(token)).thenReturn(Optional.of(managerAccount));

        assertThatThrownBy(() -> passwordResetService.confirmReset(token, "NewPass1!"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.UNAUTHORIZED));
        // 비밀번호 변경 미수행
        assertThat(managerAccount.getPasswordHash()).isEqualTo("$2a$current");
    }

    @Test
    void confirmReset_unknownToken_throwsUnauthorized() {
        when(accountRepository.findByPasswordResetToken("ghost-token")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> passwordResetService.confirmReset("ghost-token", "NewPass1!"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.UNAUTHORIZED));
    }

    @Test
    void confirmReset_weakPassword_throwsInvalidInput() {
        assertThatThrownBy(() -> passwordResetService.confirmReset("any-token", "weak"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
    }

    // ------------------------------------------------------------------
    // changePassword — reuse 시나리오
    // ------------------------------------------------------------------

    @Test
    void changePassword_wrongOldPassword_throwsUnauthorized() {
        when(accountRepository.findById(managerId)).thenReturn(Optional.of(managerAccount));
        when(passwordEncoder.matches("wrong-old", "$2a$current")).thenReturn(false);

        assertThatThrownBy(() -> passwordResetService.changePassword(managerId, "wrong-old", "NewPass1!"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.UNAUTHORIZED));
    }

    @Test
    void changePassword_reuseCurrentPassword_throwsInvalidInput() {
        when(accountRepository.findById(managerId)).thenReturn(Optional.of(managerAccount));
        // old-correct 일치
        when(passwordEncoder.matches("OldPass1!", "$2a$current")).thenReturn(true);
        // newPassword 가 현재 hash 와 일치 → reuse
        when(passwordEncoder.matches("NewPass1!", "$2a$current")).thenReturn(true);

        assertThatThrownBy(() -> passwordResetService.changePassword(managerId, "OldPass1!", "NewPass1!"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
    }

    @Test
    void changePassword_reuseHistoryHash_throwsInvalidInput() {
        // history 에 과거 hash 가 있고, newPassword 가 그 중 하나와 매치
        ReflectionTestUtils.setField(
                managerAccount, "passwordHistory", new java.util.ArrayList<>(java.util.List.of("$2a$old1", "$2a$old2")));
        when(accountRepository.findById(managerId)).thenReturn(Optional.of(managerAccount));
        when(passwordEncoder.matches("OldPass1!", "$2a$current")).thenReturn(true);
        when(passwordEncoder.matches("NewPass1!", "$2a$current")).thenReturn(false);
        when(passwordEncoder.matches("NewPass1!", "$2a$old1")).thenReturn(false);
        when(passwordEncoder.matches("NewPass1!", "$2a$old2")).thenReturn(true);

        assertThatThrownBy(() -> passwordResetService.changePassword(managerId, "OldPass1!", "NewPass1!"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
    }

    @Test
    void changePassword_validNewPassword_persistsAndClearsLockout() {
        ReflectionTestUtils.setField(managerAccount, "failedLoginAttempts", 3);
        when(accountRepository.findById(managerId)).thenReturn(Optional.of(managerAccount));
        when(passwordEncoder.matches("OldPass1!", "$2a$current")).thenReturn(true);
        when(passwordEncoder.matches("NewPass1!", "$2a$current")).thenReturn(false);
        when(passwordEncoder.encode("NewPass1!")).thenReturn("$2a$new");

        passwordResetService.changePassword(managerId, "OldPass1!", "NewPass1!");

        assertThat(managerAccount.getPasswordHash()).isEqualTo("$2a$new");
        assertThat(managerAccount.getFailedLoginAttempts()).isZero();
        assertThat(managerAccount.getPasswordChangedAt()).isNotNull();
        assertThat(managerAccount.getPasswordHistorySnapshot()).contains("$2a$current");
    }

    @Test
    void changePassword_historyTrimmedToFive() {
        // 이미 history 에 5개 — 새 변경 시 가장 오래된 것이 evicted
        ReflectionTestUtils.setField(
                managerAccount,
                "passwordHistory",
                new java.util.ArrayList<>(java.util.List.of("h1", "h2", "h3", "h4", "h5")));
        when(accountRepository.findById(managerId)).thenReturn(Optional.of(managerAccount));
        when(passwordEncoder.matches("OldPass1!", "$2a$current")).thenReturn(true);
        when(passwordEncoder.matches(eq("NewPass1!"), anyString())).thenReturn(false);
        when(passwordEncoder.encode("NewPass1!")).thenReturn("$2a$new");

        passwordResetService.changePassword(managerId, "OldPass1!", "NewPass1!");

        // 가장 최근 hash ($2a$current) 가 head 에 push 되고 가장 오래된 h5 가 drop
        assertThat(managerAccount.getPasswordHistorySnapshot())
                .hasSize(Account.PASSWORD_HISTORY_SIZE)
                .startsWith("$2a$current")
                .doesNotContain("h5");
    }

    // ------------------------------------------------------------------
    // unlockAccount
    // ------------------------------------------------------------------

    @Test
    void unlockAccount_lockedAccount_unlocksAndResetsCounter() {
        managerAccount.incrementFailedLogin(LocalDateTime.now()); // 1
        managerAccount.incrementFailedLogin(LocalDateTime.now()); // 2
        managerAccount.incrementFailedLogin(LocalDateTime.now()); // 3
        managerAccount.incrementFailedLogin(LocalDateTime.now()); // 4
        managerAccount.incrementFailedLogin(LocalDateTime.now()); // 5 → locked
        assertThat(managerAccount.isLocked()).isTrue();

        when(accountRepository.findById(managerId)).thenReturn(Optional.of(managerAccount));

        passwordResetService.unlockAccount(managerId);

        assertThat(managerAccount.isLocked()).isFalse();
        assertThat(managerAccount.getFailedLoginAttempts()).isZero();
    }

    @Test
    void unlockAccount_unknownUser_throwsNotFound() {
        UUID ghost = UUID.randomUUID();
        when(accountRepository.findById(ghost)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> passwordResetService.unlockAccount(ghost))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.NOT_FOUND));
    }

    @Test
    void unlockAccount_alreadyUnlocked_isIdempotent() {
        when(accountRepository.findById(managerId)).thenReturn(Optional.of(managerAccount));
        // 초기 상태 — locked=false, attempts=0 → no-op 정상 종료
        passwordResetService.unlockAccount(managerId);

        assertThat(managerAccount.isLocked()).isFalse();
    }

    // ArgumentCaptor 사용 — encode 호출 흐름 검증
    @Test
    void confirmReset_callsEncoderOnceWithNewPassword() {
        String token = UUID.randomUUID().toString();
        managerAccount.issueResetToken(token, LocalDateTime.now().plusMinutes(10));
        when(accountRepository.findByPasswordResetToken(token)).thenReturn(Optional.of(managerAccount));
        when(passwordEncoder.matches(anyString(), anyString())).thenReturn(false);
        when(passwordEncoder.encode(anyString())).thenReturn("$2a$new");

        passwordResetService.confirmReset(token, "NewPass1!");

        ArgumentCaptor<String> captor = ArgumentCaptor.forClass(String.class);
        verify(passwordEncoder).encode(captor.capture());
        assertThat(captor.getValue()).isEqualTo("NewPass1!");
    }
}
