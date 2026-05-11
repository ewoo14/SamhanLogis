package com.samhanair.logis.user.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.security.Role;
import com.samhanair.logis.user.client.AuthClient;
import com.samhanair.logis.user.domain.Department;
import com.samhanair.logis.user.domain.Employee;
import com.samhanair.logis.user.domain.RoleChangeHistory;
import com.samhanair.logis.user.repository.DepartmentRepository;
import com.samhanair.logis.user.repository.EmployeeRepository;
import com.samhanair.logis.user.repository.RoleChangeHistoryRepository;
import com.samhanair.logis.user.web.dto.AdminUserCreateRequest;
import com.samhanair.logis.user.web.dto.AdminUserCreateResponse;
import com.samhanair.logis.user.web.dto.AdminUserUpdateRequest;
import com.samhanair.logis.user.web.dto.CreateEmployeeRequest;
import com.samhanair.logis.user.web.dto.EmployeeResponse;
import com.samhanair.logis.user.web.dto.UpdateEmployeeRequest;
import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Provisioning saga for {@link Employee} + corresponding {@code Account} in auth-service.
 *
 * <p>Order: Auth first (so we discover loginId conflicts before touching local state),
 * then local persist. If local persist fails we compensate by calling
 * {@link AuthClient#delete(UUID)} and re-throw; secondary errors during compensation
 * are logged but swallowed so the original cause surfaces.
 */
@Service
@Transactional
@RequiredArgsConstructor
public class EmployeeProvisioningService {

    private static final Logger log = LoggerFactory.getLogger(EmployeeProvisioningService.class);

    /** 기본 부서 코드 — {@code departmentId} 미입력 시 fallback. */
    static final String DEFAULT_DEPARTMENT_CODE = "GENERAL";

    private final EmployeeRepository employeeRepository;
    private final DepartmentRepository departmentRepository;
    private final RoleChangeHistoryRepository roleHistoryRepository;
    private final AuthClient authClient;
    private final TemporaryPasswordGenerator temporaryPasswordGenerator;

    public EmployeeResponse create(CreateEmployeeRequest req, UUID callerId) {
        Department department = departmentRepository.findById(req.departmentId())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "부서를 찾을 수 없습니다"));

        UUID newId = UUID.randomUUID();

        // Step 1 — Auth first. Conflicts surface here so we never persist a half-baked employee.
        authClient.createAccount(newId, req.loginId(), req.password(), req.fullName(), req.role());

        // Step 2 — local persist; compensate on failure.
        try {
            Employee saved = employeeRepository.save(Employee.create(
                    newId,
                    req.loginId(),
                    req.fullName(),
                    req.position(),
                    req.role(),
                    department,
                    req.teamLead(),
                    req.hireDate(),
                    req.email(),
                    req.phone()));
            // Phase 12 인사 가드: 부서명을 auth-service 에 동기화 → 다음 로그인 JWT claim 포함
            authClient.updateDepartmentName(newId, department.getName());
            return EmployeeResponse.from(saved);
        } catch (RuntimeException persistFailure) {
            try {
                authClient.delete(newId);
            } catch (RuntimeException compensationFailure) {
                log.error("Compensation delete failed for account {}: {}", newId, compensationFailure.getMessage());
            }
            throw persistFailure;
        }
    }

    public EmployeeResponse update(UUID id, UpdateEmployeeRequest req, UUID callerId) {
        Employee employee = employeeRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "직원을 찾을 수 없습니다"));

        if (req.fullName() != null && !Objects.equals(req.fullName(), employee.getFullName())) {
            employee.changeFullName(req.fullName());
            // Q2 — propagate displayName drift into auth-service.
            authClient.updateDisplayName(id, req.fullName());
        }
        if (req.position() != null) {
            employee.changePosition(req.position());
        }
        if (req.departmentId() != null
                && !Objects.equals(req.departmentId(), employee.getDepartment().getId())) {
            Department dept = departmentRepository.findById(req.departmentId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "부서를 찾을 수 없습니다"));
            employee.changeDepartment(dept);
            // Phase 12 인사 가드: 부서 변경 시 auth-service 동기화
            authClient.updateDepartmentName(id, dept.getName());
        }
        if (req.teamLead() != null) {
            employee.setTeamLead(req.teamLead());
        }
        if (req.email() != null) {
            employee.changeEmail(req.email());
        }
        if (req.phone() != null) {
            employee.changePhone(req.phone());
        }
        return EmployeeResponse.from(employee);
    }

    public EmployeeResponse updateRole(UUID id, Role role, UUID callerId) {
        return updateRole(id, role, null, callerId);
    }

    /**
     * 역할 변경 + Phase 10 P0-5 변경 이력 적재.
     *
     * <p>Employee.roleSnapshot 갱신 + auth-service 동기화 + {@link RoleChangeHistory} append-only.
     * reason 은 옵션 (null 허용). 본 메서드를 통해 admin endpoint 가 호출 시 frontend 변경 이력 화면에
     * 즉시 반영.
     */
    public EmployeeResponse updateRole(UUID id, Role role, String reason, UUID callerId) {
        Employee employee = employeeRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "직원을 찾을 수 없습니다"));

        Role previous = employee.getRoleSnapshot();
        if (previous == role) {
            // 동일 role 재요청은 history append 회피 — 매뉴얼 §4 (변경 이력) 깨끗함 유지.
            return EmployeeResponse.from(employee);
        }
        employee.updateRoleSnapshot(role);
        authClient.updateRole(id, role);
        roleHistoryRepository.save(RoleChangeHistory.record(id, previous, role, reason));
        return EmployeeResponse.from(employee);
    }

    public void terminate(UUID id, LocalDate date, UUID callerId) {
        Employee employee = employeeRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "직원을 찾을 수 없습니다"));

        employee.terminate(date);
        employee.markDeleted(callerId == null ? "system" : callerId.toString());

        authClient.disable(id);
    }

    /**
     * 사용자 비활성화 — Phase 10 P0-5 admin endpoint.
     *
     * <p>terminate 와 구분: terminate 는 영구 퇴사 + soft-delete + auth-service disable 까지 수행.
     * 본 메서드는 일시 비활성화 — Employee.terminationDate = today 로 표시만 (soft-delete X).
     * 향후 enable 호출 시 즉시 복구 가능. auth-service 토큰 무효화는 W11 backlog.
     */
    public EmployeeResponse disable(UUID id, UUID callerId) {
        Employee employee = employeeRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "직원을 찾을 수 없습니다"));
        employee.terminate(LocalDate.now());
        log.info("Employee disabled — id={} callerId={}", id, callerId);
        return EmployeeResponse.from(employee);
    }

    /**
     * 사용자 재활성화 — Phase 10 P0-5 admin endpoint.
     *
     * <p>{@link #disable(UUID, UUID)} 의 역연산. terminationDate 만 null 로 복원. 영구 퇴사
     * (soft-delete) 된 직원은 본 메서드로 복구 불가 — 별도 SQL 필요.
     */
    public EmployeeResponse enable(UUID id, UUID callerId) {
        Employee employee = employeeRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "직원을 찾을 수 없습니다"));
        employee.terminate(null);
        log.info("Employee enabled — id={} callerId={}", id, callerId);
        return EmployeeResponse.from(employee);
    }

    // -------------------------------------------------------------------------
    // Phase 10 P0-5 — MASTER admin 전용 메서드 (AdminUserController 에서 호출)
    // -------------------------------------------------------------------------

    /**
     * 신규 직원 등록 (admin 전용) — 임시 비밀번호 자동 생성 + 첫 로그인 변경 강제.
     *
     * <p>Auth-first saga:
     * <ol>
     *   <li>임시 비밀번호 {@link TemporaryPasswordGenerator#generate()} 로 생성</li>
     *   <li>auth-service 에 {@code passwordChangeRequired = true} 로 계정 생성</li>
     *   <li>user-service employees 테이블 영속화 (실패 시 auth-service 보상 delete)</li>
     * </ol>
     *
     * <p>{@code departmentId} 미입력 시 {@link #DEFAULT_DEPARTMENT_CODE} ("GENERAL") 코드 부서를 fallback.
     * GENERAL 부서도 없으면 {@code ErrorCode.NOT_FOUND} throw.
     *
     * @param req      관리자가 입력한 신규 직원 정보 (로그인ID / 성명 / 이메일 / 역할 / 부서 / 전화)
     * @param callerId 호출자 (MASTER) UUID
     * @return 임시 비밀번호 평문 포함 응답 ({@link AdminUserCreateResponse})
     */
    public AdminUserCreateResponse adminCreate(AdminUserCreateRequest req, UUID callerId) {
        // 부서 조회 — departmentId 미입력 시 기본 부서(GENERAL) fallback
        Department department;
        if (req.departmentId() != null) {
            department = departmentRepository.findById(req.departmentId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "부서를 찾을 수 없습니다"));
        } else {
            department = departmentRepository.findByCode(DEFAULT_DEPARTMENT_CODE)
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                            "기본 부서(GENERAL)를 찾을 수 없습니다. departmentId 를 명시해주세요"));
        }

        UUID newId = UUID.randomUUID();
        String temporaryPassword = temporaryPasswordGenerator.generate();

        // Step 1 — Auth-first (중복 loginId 충돌 이 단계에서 표면화)
        authClient.createAccount(newId, req.loginId(), temporaryPassword,
                req.fullName(), req.role(), true);

        // Step 2 — 로컬 영속화; 실패 시 auth-service 보상 delete
        try {
            Employee saved = employeeRepository.save(Employee.create(
                    newId,
                    req.loginId(),
                    req.fullName(),
                    req.role().name(),          // position 기본값 = role명 (추후 변경 가능)
                    req.role(),
                    department,
                    false,
                    Employee.DEFAULT_HIRE_DATE,
                    req.email(),
                    req.phoneNumber()));
            // Phase 12 인사 가드: 부서명 auth-service 동기화
            authClient.updateDepartmentName(newId, department.getName());
            log.info("Admin created employee — id={} loginId={} callerId={}", newId, req.loginId(), callerId);
            return AdminUserCreateResponse.from(saved, temporaryPassword);
        } catch (RuntimeException persistFailure) {
            try {
                authClient.delete(newId);
            } catch (RuntimeException compensationFailure) {
                log.error("Compensation delete failed for account {}: {}", newId,
                        compensationFailure.getMessage());
            }
            throw persistFailure;
        }
    }

    /**
     * 직원 일반 정보 수정 (admin 전용) — fullName / email / phoneNumber / departmentId.
     *
     * <p>PATCH 시맨틱: null 이 아닌 필드만 적용. 역할 변경은 본 메서드에서 지원하지 않음
     * ({@link #updateRole(UUID, Role, String, UUID)} 전용 경로).
     *
     * <p>fullName 변경 시 auth-service displayName 도 동기화.
     *
     * @param id       대상 직원 UUID
     * @param req      수정 요청 DTO (null 필드 = 변경 없음)
     * @param callerId 호출자 (MASTER) UUID
     */
    public EmployeeResponse adminUpdate(UUID id, AdminUserUpdateRequest req, UUID callerId) {
        Employee employee = employeeRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "직원을 찾을 수 없습니다"));

        if (req.fullName() != null && !Objects.equals(req.fullName(), employee.getFullName())) {
            employee.changeFullName(req.fullName());
            authClient.updateDisplayName(id, req.fullName());
        }
        if (req.email() != null) {
            employee.changeEmail(req.email());
        }
        if (req.phoneNumber() != null) {
            employee.changePhone(req.phoneNumber());
        }
        if (req.departmentId() != null
                && !Objects.equals(req.departmentId(), employee.getDepartment().getId())) {
            Department dept = departmentRepository.findById(req.departmentId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "부서를 찾을 수 없습니다"));
            employee.changeDepartment(dept);
            // Phase 12 인사 가드: 부서 변경 시 auth-service 동기화
            authClient.updateDepartmentName(id, dept.getName());
        }
        log.info("Admin updated employee — id={} callerId={}", id, callerId);
        return EmployeeResponse.from(employee);
    }

    /**
     * 직원 퇴사 처리 (admin Soft Delete) — Soft Delete + auth-service 비활성화.
     *
     * <p>{@link #disable(UUID, UUID)} 와 달리 영구 퇴사 처리: employees 행 soft-delete +
     * auth-service account disable. enable 호출로 복구 불가.
     *
     * @param id       대상 직원 UUID
     * @param callerId 호출자 (MASTER) UUID
     */
    public void adminDisable(UUID id, UUID callerId) {
        Employee employee = employeeRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "직원을 찾을 수 없습니다"));
        employee.terminate(LocalDate.now());
        employee.markDeleted(callerId == null ? "system" : callerId.toString());
        authClient.disable(id);
        log.info("Admin disabled (soft-delete) employee — id={} callerId={}", id, callerId);
    }

    /**
     * 직원 계정 잠금 해제 (admin 전용) — auth-service unlock.
     *
     * <p>로그인 5회 실패로 잠긴 계정을 MASTER 가 해제. auth-service 의
     * {@code lockedAt = null}, {@code failedLoginAttempts = 0} 으로 초기화.
     * 이미 잠금 해제 상태인 계정에 호출해도 멱등 처리.
     *
     * @param id       대상 직원 UUID
     * @param callerId 호출자 (MASTER) UUID
     */
    public void adminUnlock(UUID id, UUID callerId) {
        // 직원 존재 검증 (soft-delete 필터 적용)
        employeeRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "직원을 찾을 수 없습니다"));
        authClient.unlock(id);
        log.info("Admin unlocked employee — id={} callerId={}", id, callerId);
    }
}
