package com.samhanair.logis.auth.service;

import com.samhanair.logis.auth.config.JwtIssueProperties;
import com.samhanair.logis.auth.domain.Account;
import com.samhanair.logis.auth.domain.AccountGroup;
import com.samhanair.logis.auth.domain.PermissionGroup;
import com.samhanair.logis.auth.repository.AccountGroupRepository;
import com.samhanair.logis.auth.repository.AccountRepository;
import com.samhanair.logis.auth.service.dto.LoginResponse;
import com.samhanair.logis.auth.service.dto.RegisterResponse;
import com.samhanair.logis.auth.web.dto.MeResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.security.JwtTokenProvider;
import com.samhanair.logis.common.security.Role;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
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
 *
 * <p>Phase C3a 갱신 — {@link #updateAccountRole} 시 빌트인 role-group 자동 동기화 +
 * effective 권한 재계산({@link EffectivePermissionMaterializer}).
 * 신규 계정 등록({@link #registerWithId}) 시에도 초기 role-group 배속을 보장.
 *
 * <p>Phase C5-1 갱신 — {@link #login} 시 계정의 활성 그룹 UUID 집합을 조회하여
 * JWT {@code groups} claim 에 comma-join 문자열로 포함. api-gateway 가
 * {@code X-User-Groups} 헤더로 downstream 에 전파한다.
 *
 * <p>Phase C5-3 갱신 — {@link #login} 응답 {@link LoginResponse#groups()} 필드 추가:
 * 계정의 활성 그룹 요약 목록({@link LoginResponse.GroupSummary})을 반환한다.
 * FE 는 그룹 {@code name} 만 렌더링하며 UUID 는 화면에 노출하지 않는다.
 *
 * <p>Phase C5-5 갱신 — accounts.role 컬럼 DROP(V46). 역할 표현을 account_groups 빌트인 그룹으로 완전 이전.
 * <ul>
 *   <li>{@link #login}: role 표시값 = account_groups ∩ 빌트인(BuiltinRoleGroupIds) 역매핑 첫 결과.
 *       역매핑 실패 시 빈 문자열 반환 — 인가 불변식 무영향(X-User-Groups/X-Is-System-Master 전담).</li>
 *   <li>{@link #registerWithId}: role 파라미터는 internal 계약 유지용이며 accounts 컬럼에 쓰지 않는다.
 *       역할 표현은 syncBuiltinRoleGroup(role) 그룹 배속만으로 완결.</li>
 *   <li>{@link #updateAccountRole}: oldRole = account_groups ∩ 빌트인 역산. DB 에서 직접 조회.</li>
 * </ul>
 *
 * <p>락아웃 불변식: role 파생 실패(그룹 미매칭)는 LoginResponse.role 을 빈 문자열로 처리하며
 * 실제 인증·인가 흐름에 영향을 주지 않는다. MASTER 계정(group100)은 X-Is-System-Master=true 로
 * 모든 권한을 bypass 하므로 role 파생 결과와 무관하게 정상 동작이 보장된다.
 */
@Slf4j
@Service
@Transactional
@RequiredArgsConstructor
public class AuthService {

    private final AccountRepository accountRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtIssueProperties jwtIssueProperties;
    private final AccountGroupService accountGroupService;
    private final EffectivePermissionMaterializer effectivePermissionMaterializer;
    private final com.samhanair.logis.auth.repository.PermissionGroupRepository permissionGroupRepository;
    /** Phase C5-1: 계정 그룹 배속 저장소 — 로그인 시 그룹 집합 조회에 사용. */
    private final AccountGroupRepository accountGroupRepository;

    @PersistenceContext
    private EntityManager entityManager;

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
        // Phase C4: is_system_master 그룹 멤버십 산출 (EXISTS, 저비용 1쿼리)
        boolean isSystemMaster = permissionGroupRepository
                .existsByAccountIdAndSystemMasterTrue(account.getId());
        // Phase C5-1: 활성 그룹 UUID 집합 조회 → comma-join 문자열
        // P2: groupId 오름차순 ORDER BY 로 claim 순서 결정성 보장 (로그인마다 동일 문자열)
        List<com.samhanair.logis.auth.domain.AccountGroup> activeGroups =
                accountGroupRepository.findByAccountIdAndIsDeletedFalseOrderByGroupIdAsc(account.getId());
        String groups = activeGroups.stream()
                .map(ag -> ag.getGroupId().toString())
                .collect(Collectors.joining(","));

        // Phase C5-5: role 표시값 — account_groups ∩ 빌트인(BuiltinRoleGroupIds) 역매핑 첫 결과.
        // accounts.role 컬럼 DROP(V46) 이후 역할은 그룹 배속으로만 표현한다.
        // P2: 공통 헬퍼 BuiltinRoleGroupIds.deriveRoleName 로 역매핑 로직 중복 제거.
        // 역매핑 실패(그룹 미매칭) 시 빈 문자열 반환 + log.warn — 인가 불변식 무영향(락아웃 가드).
        String role = BuiltinRoleGroupIds.deriveRoleName(activeGroups, loginId);

        // Phase 12 인사 가드 + 표시명 claim + Phase C4 isSystemMaster claim + Phase C5-1 groups claim 포함 JWT 발급
        String token = JwtTokenProvider.generate(
                userId, role, account.getDepartmentName(), account.getDisplayName(),
                isSystemMaster, groups,
                jwtIssueProperties.getTtlSeconds(), jwtIssueProperties.getSecretBytes());

        // Phase C5-3: 활성 그룹 요약 목록 조회 (id, name, builtin) — FE AuthSnapshot.groups 수신
        List<LoginResponse.GroupSummary> groupSummaries = loadGroupSummaries(account.getId());

        return new LoginResponse(token, userId, role, account.getDisplayName(), groupSummaries);
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
     * <p>Phase C3a: 계정 저장 후 초기 역할에 대응하는 빌트인 role-group 을 자동 배속하고
     * effective 권한을 재계산한다. V44 마이그레이션은 기존 계정 1회성 배속이므로,
     * 신규 계정은 이 경로가 role-group 배속의 단일 진실원이 된다.
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
        // C5-5: Account.createWithId 에 role 파라미터 없음 — accounts.role 컬럼 DROP(V46).
        // 역할 표현은 아래 syncBuiltinRoleGroup(role) 그룹 배속으로 완결.
        Account account = Account.createWithId(id, loginId, passwordHash, displayName);
        if (passwordChangeRequired) {
            account.setPasswordChangeRequired(true);
        }
        // id 선세팅 계정은 JPA save() 가 merge() 를 호출해 영속 상태로 전환.
        // merge() 반환값(managed entity)을 사용해야 pending INSERT 가 flush 에 포함됨.
        // account_groups FK 충족을 위해 accounts INSERT 를 먼저 DB 에 반영.
        Account managed = accountRepository.save(account);
        entityManager.flush();

        // 초기 빌트인 role-group 배속 (oldRole=null → unassign 스텝 no-op, assign 스텝만 수행)
        accountGroupService.syncBuiltinRoleGroup(managed.getId(), null, role);
        effectivePermissionMaterializer.materializeForAccount(managed.getId());

        // C5-5: RegisterResponse.role 은 role 파라미터 직접 전달 (accounts 컬럼 미경유)
        return new RegisterResponse(managed.getId().toString(), managed.getLoginId(), role.name());
    }

    /**
     * 계정 역할을 변경하고 빌트인 role-group 배속을 원자적으로 동기화한다.
     *
     * <p>Phase C3a: 단일 {@code @Transactional} 안에서 아래 순서로 수행한다.
     * <ol>
     *   <li>현재 빌트인 그룹 멤버십 역산으로 oldRole 파생.</li>
     *   <li>변경 전 역할의 빌트인 role-group 배속 soft-delete.</li>
     *   <li>새 역할의 빌트인 role-group 배속 생성(없으면) 또는 유지.</li>
     *   <li>{@link EffectivePermissionMaterializer#materializeForAccount(UUID)} 로 effective 권한 재계산.</li>
     * </ol>
     * 수동으로 배속된 비-빌트인 그룹은 보존되며 권한은 OR 합집합으로 반영된다.
     *
     * <p>C5-5: accounts.role 컬럼 DROP(V46) 으로 {@code account.changeRole()} 호출이 제거됨.
     * oldRole 은 account_groups ∩ 빌트인(BuiltinRoleGroupIds) 역산으로 파생한다.
     *
     * @param id   역할 변경 대상 계정 UUID
     * @param role 새 역할
     */
    public void updateAccountRole(UUID id, Role role) {
        // 계정 존재 확인 (조회 결과는 역할 변경에 사용하지 않음 — accounts.role 컬럼 없음)
        accountRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "계정을 찾을 수 없습니다"));

        // C5-5 / P1-a: oldRole 역산은 syncBuiltinRoleGroup 내부에서 전체 빌트인 그룹 정리로 강화됨.
        // oldRole 파라미터는 더 이상 정리 범위를 결정하지 않으므로 null 전달로 단순화한다.
        // (syncBuiltinRoleGroup 은 항상 활성 빌트인 그룹 전체를 soft-delete 후 newRole 단일 배속)
        Role oldRole = null;

        // 빌트인 role-group 교체 (시스템 그룹 가드 우회 내부 경로)
        accountGroupService.syncBuiltinRoleGroup(id, oldRole, role);
        // effective 권한 재계산
        effectivePermissionMaterializer.materializeForAccount(id);

        log.info("[AuthService] role changed — id={}, {} → {}", id, oldRole, role);
    }

    /**
     * /me 엔드포인트용 계정 정보 조회.
     *
     * <p>P1-b: 기존 AuthController 가 AccountGroupRepository 를 직접 주입하여
     * role 파생을 수행하던 레이어 위반을 해소한다.
     * Controller 는 Service 만 의존하며, 그룹 배속 저장소 접근은 이 메서드로 일원화된다.
     *
     * <p>P2: role 파생은 {@link BuiltinRoleGroupIds#deriveRoleName} 공통 헬퍼를 사용한다.
     *
     * @param userId 계정 UUID
     * @return /me 응답 DTO
     */
    @Transactional(readOnly = true)
    public MeResponse getMeResponse(UUID userId) {
        Account account = accountRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "사용자를 찾을 수 없습니다"));
        List<AccountGroup> activeGroups =
                accountGroupRepository.findByAccountIdAndIsDeletedFalseOrderByGroupIdAsc(userId);
        // P2: 공통 헬퍼로 role 파생 — 빈 문자열 fallback 시 log.warn 자동 포함
        String role = BuiltinRoleGroupIds.deriveRoleName(activeGroups, userId);
        return new MeResponse(
                account.getId().toString(),
                account.getLoginId(),
                role,
                account.getDisplayName(),
                null,
                loadGroupSummaries(account.getId()));
    }

    /**
     * 로그인 응답과 /me 응답이 동일한 그룹 요약 schema 를 반환하도록 공용화한다.
     *
     * @param accountId 계정 UUID
     * @return 활성 권한그룹 요약 목록
     */
    private List<LoginResponse.GroupSummary> loadGroupSummaries(UUID accountId) {
        return permissionGroupRepository
                .findActiveGroupsByAccountId(accountId)
                .stream()
                .map(pg -> new LoginResponse.GroupSummary(pg.getId().toString(), pg.getName(), pg.isBuiltin()))
                .toList();
    }

    /**
     * loginId 로 내부 계정 UUID 를 조회한다.
     *
     * <p>서비스 간 알림 수신자 정규화에서 과거 username 식별자를 push 가능한 accountId 로 변환하기 위한
     * read-only 계약이다. 계정 UUID 는 user-service 직원 UUID 와 동일 공간을 사용한다.
     *
     * @param loginId 로그인 아이디
     * @return accountId UUID
     * @throws BusinessException NOT_FOUND — loginId 에 해당하는 활성 계정이 없을 때
     */
    @Transactional(readOnly = true)
    public UUID findAccountIdByLoginId(String loginId) {
        if (loginId == null || loginId.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "loginId 는 필수입니다");
        }
        Account account = accountRepository.findByLoginId(loginId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "계정을 찾을 수 없습니다"));
        if (!account.isEnabled()) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "계정을 찾을 수 없습니다");
        }
        return account.getId();
    }

    public Account findAccount(UUID id) {
        return accountRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "계정을 찾을 수 없습니다"));
    }

    public void updateAccountDisplayName(UUID id, String displayName) {
        Account account = accountRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "계정을 찾을 수 없습니다"));
        account.changeDisplayName(displayName);
    }

    /**
     * 소속 부서명 갱신 — Phase 12 인사 카테고리 가드.
     *
     * <p>user-service 에서 직원 등록/부서 변경 시 internal endpoint 를 통해 호출.
     * 다음 로그인 시 발급되는 JWT 에 {@code departmentName} claim 이 갱신된 값으로 포함됨.
     *
     * @param id             갱신할 계정 UUID
     * @param departmentName 신규 부서명 (null = 미배정)
     */
    public void updateAccountDepartmentName(UUID id, String departmentName) {
        Account account = accountRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "계정을 찾을 수 없습니다"));
        account.changeDepartmentName(departmentName);
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
