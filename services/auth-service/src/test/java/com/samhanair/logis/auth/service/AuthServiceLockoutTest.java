package com.samhanair.logis.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import com.samhanair.logis.auth.config.JwtIssueProperties;
import com.samhanair.logis.auth.domain.Account;
import com.samhanair.logis.auth.repository.AccountRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Phase 10 P0-2 — login 잠금 시나리오 (5 회 실패 → locked_at 자동 세팅).
 */
@ExtendWith(MockitoExtension.class)
class AuthServiceLockoutTest {

    @Mock
    private AccountRepository accountRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private JwtIssueProperties jwtIssueProperties;

    @InjectMocks
    private AuthService authService;

    private Account account;

    @BeforeEach
    void setUp() {
        // C5-5: Account.create 에 role 파라미터 없음 — accounts.role 컬럼 DROP(V46)
        account = Account.create("alice", "$2a$encoded", "Alice");
        ReflectionTestUtils.setField(account, "id", UUID.randomUUID());
    }

    @Test
    void login_failedFiveTimes_locksAccountAndRejectsFurtherAttempts() {
        when(accountRepository.findByLoginId("alice")).thenReturn(Optional.of(account));
        when(passwordEncoder.matches("wrong", "$2a$encoded")).thenReturn(false);

        // 1 ~ 4 회 실패
        for (int i = 1; i <= 4; i++) {
            assertThatThrownBy(() -> authService.login("alice", "wrong"))
                    .isInstanceOf(BusinessException.class);
            assertThat(account.isLocked()).as("after %d fails", i).isFalse();
            assertThat(account.getFailedLoginAttempts()).isEqualTo(i);
        }

        // 5 회 실패 → 잠금 트리거 + 잠금 메시지
        assertThatThrownBy(() -> authService.login("alice", "wrong"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("계정이 잠겼습니다")
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.UNAUTHORIZED));

        assertThat(account.isLocked()).isTrue();
        assertThat(account.getFailedLoginAttempts()).isEqualTo(5);

        // 잠금 후 정확한 비밀번호로도 거절
        assertThatThrownBy(() -> authService.login("alice", "wrong"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("계정이 잠겼습니다");
    }

    @Test
    void login_lockedAccount_rejectedEvenWithCorrectPassword() {
        // pre-lock 세팅
        ReflectionTestUtils.setField(account, "failedLoginAttempts", 5);
        ReflectionTestUtils.setField(account, "lockedAt", java.time.LocalDateTime.now());
        when(accountRepository.findByLoginId("alice")).thenReturn(Optional.of(account));

        assertThatThrownBy(() -> authService.login("alice", "anything"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("계정이 잠겼습니다");
    }

    @Test
    void login_disabledAccount_rejected() {
        account.disable();
        when(accountRepository.findByLoginId("alice")).thenReturn(Optional.of(account));

        assertThatThrownBy(() -> authService.login("alice", "anything"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("비활성화");
    }
}
