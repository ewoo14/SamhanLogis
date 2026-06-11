package com.samhanair.logis.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.auth.config.JwtIssueProperties;
import com.samhanair.logis.auth.domain.Account;
import com.samhanair.logis.auth.domain.AccountGroup;
import com.samhanair.logis.auth.repository.AccountGroupRepository;
import com.samhanair.logis.auth.repository.AccountRepository;
import com.samhanair.logis.auth.repository.PermissionGroupRepository;
import com.samhanair.logis.auth.service.dto.LoginResponse;
import com.samhanair.logis.auth.service.dto.RegisterResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.security.JwtTokenProvider;
import com.samhanair.logis.common.security.Role;
import jakarta.persistence.EntityManager;
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
import org.mockito.MockedStatic;
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

    @Mock
    private AccountGroupService accountGroupService;

    @Mock
    private EffectivePermissionMaterializer effectivePermissionMaterializer;

    @Mock
    private PermissionGroupRepository permissionGroupRepository;

    @Mock
    private AccountGroupRepository accountGroupRepository;

    @Mock
    private EntityManager entityManager;

    @InjectMocks
    private AuthService authService;

    private Account managerAccount;

    @BeforeEach
    void setUp() {
        // C5-5: Account.create 에 role 파라미터 없음 — accounts.role 컬럼 DROP(V46)
        managerAccount = Account.create("alice", "$2a$encoded", "Alice");
        ReflectionTestUtils.setField(managerAccount, "id", UUID.randomUUID());
        // @PersistenceContext 필드는 @InjectMocks 가 처리하지 않으므로 수동 주입
        ReflectionTestUtils.setField(authService, "entityManager", entityManager);
    }

    @Test
    @DisplayName("C5-5: 로그인 시 role 은 빌트인 그룹 역매핑으로 파생된다")
    void login_withCorrectPassword_returnsTokenAndRole() {
        // C5-5: MANAGER 빌트인 그룹 UUID (BuiltinRoleGroupIds.MANAGER = ...000101)
        UUID managerGroupId = UUID.fromString("00000000-0000-0000-0000-000000000101");
        AccountGroup managerGroup = AccountGroup.assign(managerAccount.getId(), managerGroupId);

        when(accountRepository.findByLoginId("alice")).thenReturn(Optional.of(managerAccount));
        when(passwordEncoder.matches("password123", "$2a$encoded")).thenReturn(true);
        when(jwtIssueProperties.getTtlSeconds()).thenReturn(3600L);
        when(jwtIssueProperties.getSecretBytes()).thenReturn("secret-bytes-32-chars-min-aaaaaaaaa".getBytes());
        // C5-5: MANAGER 빌트인 그룹 반환 → role 파생 = "MANAGER"
        when(accountGroupRepository.findByAccountIdAndIsDeletedFalseOrderByGroupIdAsc(managerAccount.getId()))
                .thenReturn(List.of(managerGroup));

        try (MockedStatic<JwtTokenProvider> mocked = Mockito.mockStatic(JwtTokenProvider.class)) {
            // displayName 포함 8-arg overload (departmentName + displayName + isSystemMaster + groups)
            mocked.when(() -> JwtTokenProvider.generate(
                    anyString(), eq("MANAGER"),
                    org.mockito.ArgumentMatchers.nullable(String.class),
                    eq("Alice"),
                    org.mockito.ArgumentMatchers.anyBoolean(),
                    anyString(),
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
    @DisplayName("C4/C5-5: MASTER 계정 로그인 시 isSystemMaster=true 산출 + role='MASTER' 빌트인 그룹 파생")
    void login_masterAccount_isSystemMasterTrue() {
        Account masterAccount = Account.create("master01", "$2a$encoded", "Master");
        UUID masterId = UUID.randomUUID();
        ReflectionTestUtils.setField(masterAccount, "id", masterId);

        // C5-5: MASTER 빌트인 그룹 UUID (BuiltinRoleGroupIds.MASTER = ...000100)
        UUID masterGroupId = UUID.fromString("00000000-0000-0000-0000-000000000100");
        AccountGroup masterGroup = AccountGroup.assign(masterId, masterGroupId);

        when(accountRepository.findByLoginId("master01")).thenReturn(Optional.of(masterAccount));
        when(passwordEncoder.matches("pass", "$2a$encoded")).thenReturn(true);
        when(jwtIssueProperties.getTtlSeconds()).thenReturn(3600L);
        when(jwtIssueProperties.getSecretBytes()).thenReturn("secret-bytes-32-chars-min-aaaaaaaaa".getBytes());
        // Phase C4: MASTER → systemMaster 그룹 배속 → true 반환
        when(permissionGroupRepository.existsByAccountIdAndSystemMasterTrue(masterId)).thenReturn(true);
        // C5-5: MASTER 빌트인 그룹 반환 → role 파생 = "MASTER"
        when(accountGroupRepository.findByAccountIdAndIsDeletedFalseOrderByGroupIdAsc(masterId))
                .thenReturn(List.of(masterGroup));

        try (MockedStatic<JwtTokenProvider> mocked = Mockito.mockStatic(JwtTokenProvider.class)) {
            // displayName 포함 8-arg overload
            mocked.when(() -> JwtTokenProvider.generate(
                    anyString(), eq("MASTER"),
                    org.mockito.ArgumentMatchers.nullable(String.class),
                    eq("Master"),
                    eq(true),
                    anyString(),
                    anyLong(), any(byte[].class)))
                    .thenReturn("master-jwt");

            LoginResponse response = authService.login("master01", "pass");

            assertThat(response.token()).isEqualTo("master-jwt");
            assertThat(response.role()).isEqualTo("MASTER");
            // isSystemMaster=true, groups="" 로 generate 호출됐는지 검증
            mocked.verify(() -> JwtTokenProvider.generate(
                    anyString(), eq("MASTER"),
                    org.mockito.ArgumentMatchers.nullable(String.class),
                    eq("Master"),
                    eq(true),
                    anyString(),
                    anyLong(), any(byte[].class)));
        }
    }

    @Test
    @DisplayName("C4/C5-5: 비-MASTER 계정 로그인 시 isSystemMaster=false + role='MANAGER' 빌트인 그룹 파생")
    void login_nonMasterAccount_isSystemMasterFalse() {
        // C5-5: MANAGER 빌트인 그룹 UUID
        UUID managerGroupId = UUID.fromString("00000000-0000-0000-0000-000000000101");
        AccountGroup managerGroup = AccountGroup.assign(managerAccount.getId(), managerGroupId);

        when(accountRepository.findByLoginId("alice")).thenReturn(Optional.of(managerAccount));
        when(passwordEncoder.matches("password123", "$2a$encoded")).thenReturn(true);
        when(jwtIssueProperties.getTtlSeconds()).thenReturn(3600L);
        when(jwtIssueProperties.getSecretBytes()).thenReturn("secret-bytes-32-chars-min-aaaaaaaaa".getBytes());
        // 비-MASTER → false 반환 (기본값이지만 명시)
        when(permissionGroupRepository.existsByAccountIdAndSystemMasterTrue(managerAccount.getId()))
                .thenReturn(false);
        // C5-5: MANAGER 빌트인 그룹 반환 → role 파생 = "MANAGER"
        when(accountGroupRepository.findByAccountIdAndIsDeletedFalseOrderByGroupIdAsc(managerAccount.getId()))
                .thenReturn(List.of(managerGroup));

        try (MockedStatic<JwtTokenProvider> mocked = Mockito.mockStatic(JwtTokenProvider.class)) {
            // displayName 포함 8-arg overload
            mocked.when(() -> JwtTokenProvider.generate(
                    anyString(), eq("MANAGER"),
                    org.mockito.ArgumentMatchers.nullable(String.class),
                    eq("Alice"),
                    eq(false),
                    anyString(),
                    anyLong(), any(byte[].class)))
                    .thenReturn("manager-jwt");

            LoginResponse response = authService.login("alice", "password123");

            assertThat(response.token()).isEqualTo("manager-jwt");
            // isSystemMaster=false 로 generate 호출됐는지 검증
            mocked.verify(() -> JwtTokenProvider.generate(
                    anyString(), eq("MANAGER"),
                    org.mockito.ArgumentMatchers.nullable(String.class),
                    eq("Alice"),
                    eq(false),
                    anyString(),
                    anyLong(), any(byte[].class)));
        }
    }

    @Test
    @DisplayName("C5-1: 로그인 시 활성 그룹 UUID 집합이 comma-join 으로 generate 에 전달")
    void login_groupsPassedToGenerate() {
        UUID groupId1 = UUID.fromString("aaaaaaaa-0000-0000-0000-000000000001");
        UUID groupId2 = UUID.fromString("aaaaaaaa-0000-0000-0000-000000000002");

        AccountGroup ag1 = AccountGroup.assign(managerAccount.getId(), groupId1);
        AccountGroup ag2 = AccountGroup.assign(managerAccount.getId(), groupId2);

        when(accountRepository.findByLoginId("alice")).thenReturn(Optional.of(managerAccount));
        when(passwordEncoder.matches("password123", "$2a$encoded")).thenReturn(true);
        when(jwtIssueProperties.getTtlSeconds()).thenReturn(3600L);
        when(jwtIssueProperties.getSecretBytes()).thenReturn("secret-bytes-32-chars-min-aaaaaaaaa".getBytes());
        when(permissionGroupRepository.existsByAccountIdAndSystemMasterTrue(managerAccount.getId()))
                .thenReturn(false);
        // Phase C5-1: 그룹 2개 반환
        when(accountGroupRepository.findByAccountIdAndIsDeletedFalseOrderByGroupIdAsc(managerAccount.getId()))
                .thenReturn(List.of(ag1, ag2));

        try (MockedStatic<JwtTokenProvider> mocked = Mockito.mockStatic(JwtTokenProvider.class)) {
            mocked.when(() -> JwtTokenProvider.generate(
                    anyString(), anyString(),
                    org.mockito.ArgumentMatchers.nullable(String.class),
                    eq("Alice"),
                    org.mockito.ArgumentMatchers.anyBoolean(),
                    anyString(),
                    anyLong(), any(byte[].class)))
                    .thenReturn("groups-jwt");

            LoginResponse response = authService.login("alice", "password123");

            assertThat(response.token()).isEqualTo("groups-jwt");
            // C5-5: groupId1/groupId2 는 비빌트인 UUID → role 파생 실패 = "" (락아웃 불변식 OK)
            // groups 가 comma-join UUID 형태로 generate 에 전달됐는지 검증 (role 은 anyString)
            String expectedGroups = groupId1 + "," + groupId2;
            mocked.verify(() -> JwtTokenProvider.generate(
                    anyString(), anyString(),
                    org.mockito.ArgumentMatchers.nullable(String.class),
                    eq("Alice"),
                    eq(false),
                    eq(expectedGroups),
                    anyLong(), any(byte[].class)));
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
    @DisplayName("C5-5: register 시 BCrypt 해시 저장 + role 은 RegisterResponse 에서 파라미터 직접 전달")
    void register_persistsAccountWithBcryptHashedPassword() {
        when(accountRepository.existsByLoginId("bob")).thenReturn(false);
        when(passwordEncoder.encode("plain-password")).thenReturn("$2a$bcrypt-hash");
        when(accountRepository.save(any(Account.class))).thenAnswer(inv -> {
            Account a = inv.getArgument(0);
            ReflectionTestUtils.setField(a, "id", UUID.randomUUID());
            return a;
        });
        doNothing().when(accountGroupService).syncBuiltinRoleGroup(any(), any(), any());
        doNothing().when(effectivePermissionMaterializer).materializeForAccount(any());

        RegisterResponse response = authService.register("bob", "plain-password", "Bob", Role.SALES);

        ArgumentCaptor<Account> captor = ArgumentCaptor.forClass(Account.class);
        verify(accountRepository).save(captor.capture());
        Account saved = captor.getValue();

        assertThat(saved.getPasswordHash()).isEqualTo("$2a$bcrypt-hash");
        assertThat(saved.getPasswordHash()).isNotEqualTo("plain-password");
        assertThat(saved.getLoginId()).isEqualTo("bob");
        // C5-5: saved.getRole() 제거됨 — role 은 RegisterResponse 로 role 파라미터 직접 전달
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

    @Test
    @DisplayName("C5-5/P1-a: updateAccountRole — syncBuiltinRoleGroup 이 활성 빌트인 그룹 전체 정리 담당(oldRole 역산 불요)")
    void updateAccountRole_changesRoleAndSyncsRoleGroup() {
        UUID accountId = UUID.randomUUID();
        // C5-5: Account.create 에 role 파라미터 없음
        Account account = Account.create("charlie", "$2a$hash", "Charlie");
        ReflectionTestUtils.setField(account, "id", accountId);

        when(accountRepository.findById(accountId)).thenReturn(Optional.of(account));
        // P1-a: oldRole 역산 제거 — syncBuiltinRoleGroup 이 내부에서 활성 빌트인 그룹 전체를
        // soft-delete 후 newRole 단일 배속하므로 oldRole=null 전달, 그룹 조회 stub 불필요.
        doNothing().when(accountGroupService).syncBuiltinRoleGroup(eq(accountId), isNull(), eq(Role.SALES));
        doNothing().when(effectivePermissionMaterializer).materializeForAccount(accountId);

        authService.updateAccountRole(accountId, Role.SALES);

        // P1-a: oldRole=null 로 호출 — 정리 범위는 syncBuiltinRoleGroup 이 활성 빌트인 전체로 결정
        verify(accountGroupService).syncBuiltinRoleGroup(accountId, null, Role.SALES);
        verify(effectivePermissionMaterializer).materializeForAccount(accountId);
    }
}
