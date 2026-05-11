package com.samhanair.logis.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.auth.config.JwtIssueProperties;
import com.samhanair.logis.auth.domain.Account;
import com.samhanair.logis.auth.repository.AccountRepository;
import com.samhanair.logis.auth.service.dto.LoginResponse;
import com.samhanair.logis.auth.service.dto.RegisterResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.security.JwtTokenProvider;
import com.samhanair.logis.common.security.Role;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.MockedStatic;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    private AccountRepository accountRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private JwtIssueProperties jwtIssueProperties;

    @InjectMocks
    private AuthService authService;

    private Account managerAccount;

    @BeforeEach
    void setUp() {
        managerAccount = Account.create("alice", "$2a$encoded", "Alice", Role.MANAGER);
        ReflectionTestUtils.setField(managerAccount, "id", UUID.randomUUID());
    }

    @Test
    void login_withCorrectPassword_returnsTokenAndRole() {
        when(accountRepository.findByLoginId("alice")).thenReturn(Optional.of(managerAccount));
        when(passwordEncoder.matches("password123", "$2a$encoded")).thenReturn(true);
        when(jwtIssueProperties.getTtlSeconds()).thenReturn(3600L);
        when(jwtIssueProperties.getSecretBytes()).thenReturn("secret-bytes-32-chars-min-aaaaaaaaa".getBytes());

        try (MockedStatic<JwtTokenProvider> mocked = Mockito.mockStatic(JwtTokenProvider.class)) {
            // Phase 12 인사 가드: 4-arg overload (departmentName claim) — nullable
            mocked.when(() -> JwtTokenProvider.generate(
                    anyString(), eq("MANAGER"),
                    org.mockito.ArgumentMatchers.nullable(String.class),
                    anyLong(), any(byte[].class)))
                    .thenReturn("jwt-token");

            LoginResponse response = authService.login("alice", "password123");

            assertThat(response.token()).isEqualTo("jwt-token");
            assertThat(response.role()).isEqualTo("MANAGER");
            assertThat(response.displayName()).isEqualTo("Alice");
            assertThat(managerAccount.getLastLoginAt()).isNotNull();
        }
    }

    @Test
    void login_withWrongPassword_throwsUnauthorized() {
        when(accountRepository.findByLoginId("alice")).thenReturn(Optional.of(managerAccount));
        when(passwordEncoder.matches("bad", "$2a$encoded")).thenReturn(false);

        assertThatThrownBy(() -> authService.login("alice", "bad"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.UNAUTHORIZED));
    }

    @Test
    void login_withUnknownLoginId_throwsUnauthorized() {
        when(accountRepository.findByLoginId("ghost")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> authService.login("ghost", "whatever1"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.UNAUTHORIZED));
    }

    @Test
    void register_persistsAccountWithBcryptHashedPassword() {
        when(accountRepository.existsByLoginId("bob")).thenReturn(false);
        when(passwordEncoder.encode("plain-password")).thenReturn("$2a$bcrypt-hash");
        when(accountRepository.save(any(Account.class))).thenAnswer(inv -> {
            Account a = inv.getArgument(0);
            ReflectionTestUtils.setField(a, "id", UUID.randomUUID());
            return a;
        });

        RegisterResponse response = authService.register("bob", "plain-password", "Bob", Role.SALES);

        ArgumentCaptor<Account> captor = ArgumentCaptor.forClass(Account.class);
        verify(accountRepository).save(captor.capture());
        Account saved = captor.getValue();

        assertThat(saved.getPasswordHash()).isEqualTo("$2a$bcrypt-hash");
        assertThat(saved.getPasswordHash()).isNotEqualTo("plain-password");
        assertThat(saved.getLoginId()).isEqualTo("bob");
        assertThat(saved.getRole()).isEqualTo(Role.SALES);
        assertThat(response.loginId()).isEqualTo("bob");
        assertThat(response.role()).isEqualTo("SALES");
    }

    @Test
    void register_duplicateLoginId_throwsConflict() {
        when(accountRepository.existsByLoginId("alice")).thenReturn(true);

        assertThatThrownBy(() -> authService.register("alice", "password123", "Alice", Role.MANAGER))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));

        verify(accountRepository, never()).save(any());
    }
}
