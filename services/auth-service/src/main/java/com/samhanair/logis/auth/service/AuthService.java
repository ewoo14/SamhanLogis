package com.samhanair.logis.auth.service;

import com.samhanair.logis.auth.config.JwtIssueProperties;
import com.samhanair.logis.auth.domain.Account;
import com.samhanair.logis.auth.domain.AccountGroup;
import com.samhanair.logis.auth.repository.AccountGroupRepository;
import com.samhanair.logis.auth.repository.AccountRepository;
import com.samhanair.logis.auth.service.dto.LoginResponse;
import com.samhanair.logis.auth.service.dto.RegisterResponse;
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
 * 본 슬라이스에서는 전파만 수행하며 소비처는 C5-2 에서 구현된다.
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
        String role = account.getRole().name();
        // Phase C4: is_system_master 그룹 멤버십 산출 (EXISTS, 저비용 1쿼리)
        boolean isSystemMaster = permissionGroupRepository
                .existsByAccountIdAndSystemMasterTrue(account.getId());
        // Phase C5-1: 활성 그룹 UUID 집합 조회 → comma-join 문자열 (소비처는 C5-2 에서 구현)
        String groups = accountGroupRepository
                .findByAccountIdAndIsDeletedFalse(account.getId())
                .stream()
                .map(ag -> ag.getGroupId().toString())
                .collect(Collectors.joining(","));
        // Phase 12 인사 가드 + Phase C4 isSystemMaster claim + Phase C5-1 groups claim 포함 JWT 발급
        String token = JwtTokenProvider.generate(
                userId, role, account.getDepartmentName(),
                isSystemMaster, groups,
                jwtIssueProperties.getTtlSeconds(), jwtIssueProperties.getSecretBytes());

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
        Account account = Account.createWithId(id, loginId, passwordHash, displayName, role);
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

        return new RegisterResponse(managed.getId().toString(), managed.getLoginId(), managed.getRole().name());
    }

    /**
     * 계정 역할을 변경하고 빌트인 role-group 배속을 원자적으로 동기화한다.
     *
     * <p>Phase C3a: 단일 {@code @Transactional} 안에서 아래 순서로 수행한다.
     * <ol>
     *   <li>변경 전 역할의 빌트인 role-group 배속 soft-delete.</li>
     *   <li>{@link Account#changeRole(Role)} 으로 역할 변경.</li>
     *   <li>새 역할의 빌트인 role-group 배속 생성(없으면) 또는 유지.</li>
     *   <li>{@link EffectivePermissionMaterializer#materializeForAccount(UUID)} 로 effective 권한 재계산.</li>
     * </ol>
     * 수동으로 배속된 비-빌트인 그룹은 보존되며 권한은 OR 합집합으로 반영된다.
     *
     * @param id   역할 변경 대상 계정 UUID
     * @param role 새 역할
     */
    public void updateAccountRole(UUID id, Role role) {
        Account account = accountRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "계정을 찾을 수 없습니다"));

        Role oldRole = account.getRole();
        // 빌트인 role-group 교체 (시스템 그룹 가드 우회 내부 경로)
        accountGroupService.syncBuiltinRoleGroup(id, oldRole, role);
        // 역할 변경
        account.changeRole(role);
        // effective 권한 재계산
        effectivePermissionMaterializer.materializeForAccount(id);

        log.info("[AuthService] role changed — id={}, {} → {}", id, oldRole, role);
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
