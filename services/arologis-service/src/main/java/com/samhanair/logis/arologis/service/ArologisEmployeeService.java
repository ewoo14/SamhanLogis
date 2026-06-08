package com.samhanair.logis.arologis.service;

import com.samhanair.logis.arologis.domain.ArologisDepartment;
import com.samhanair.logis.arologis.domain.ArologisEmployee;
import com.samhanair.logis.arologis.domain.ArologisRoleChangeHistory;
import com.samhanair.logis.arologis.domain.auth.AdminUser;
import com.samhanair.logis.arologis.domain.auth.AdminUserRole;
import com.samhanair.logis.arologis.repository.AdminUserRepository;
import com.samhanair.logis.arologis.repository.ArologisDepartmentRepository;
import com.samhanair.logis.arologis.repository.ArologisEmployeeRepository;
import com.samhanair.logis.arologis.repository.ArologisRoleChangeHistoryRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 아로로지스 행정직원 관리 서비스. */
@Service
@RequiredArgsConstructor
@Transactional
public class ArologisEmployeeService {

    private static final char[] PASSWORD_CHARS =
            "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%".toCharArray();
    private static final int TEMP_PASSWORD_LENGTH = 16;

    private final ArologisEmployeeRepository employeeRepository;
    private final ArologisDepartmentRepository departmentRepository;
    private final ArologisRoleChangeHistoryRepository historyRepository;
    private final AdminUserRepository adminUserRepository;
    private final PasswordEncoder passwordEncoder;
    private final SecureRandom secureRandom = new SecureRandom();

    /**
     * 직원 생성 + AdminUser 자동 provisioning.
     *
     * <p>임시 비밀번호 평문은 본 반환값에만 포함한다. 저장되는 값은 BCrypt 해시이다.
     */
    public ProvisionedEmployee createEmployee(CreateEmployeeCommand command, String actor) {
        assertUniqueLoginId(command.loginId());
        ArologisDepartment department = findDepartment(command.departmentCode());
        String temporaryPassword = generateTemporaryPassword();
        AdminUser adminUser = adminUserRepository.save(AdminUser.create(
                command.loginId(),
                passwordEncoder.encode(temporaryPassword),
                command.fullName(),
                command.role()));
        ArologisEmployee employee = employeeRepository.save(ArologisEmployee.create(
                adminUser,
                command.loginId(),
                command.fullName(),
                command.position(),
                department,
                command.hireDate(),
                command.email(),
                command.phone()));
        historyRepository.save(ArologisRoleChangeHistory.record(
                employee.getId(), null, command.role(), "신규 직원 계정 생성"));
        return new ProvisionedEmployee(EmployeeView.from(employee), temporaryPassword);
    }

    /** 직원 기본 정보 수정. */
    public EmployeeView update(String loginId, UpdateEmployeeCommand command) {
        ArologisEmployee employee = findEmployee(loginId);
        ArologisDepartment department = findDepartment(command.departmentCode());
        employee.updateProfile(
                command.fullName(),
                command.position(),
                department,
                command.email(),
                command.phone());
        return EmployeeView.from(employee);
    }

    /** 직원 롤 변경. 동일 롤 요청은 멱등 처리하고 이력을 남기지 않는다. */
    public EmployeeView changeRole(String loginId, AdminUserRole newRole, String reason, String actor) {
        ArologisEmployee employee = findEmployee(loginId);
        AdminUser adminUser = employee.getAdminUser();
        AdminUserRole previousRole = adminUser.getRole();
        if (previousRole == newRole) {
            return EmployeeView.from(employee);
        }
        adminUser.updateRole(newRole);
        historyRepository.save(ArologisRoleChangeHistory.record(
                employee.getId(), previousRole, newRole, reason));
        return EmployeeView.from(employee);
    }

    /** 퇴직 처리. 직원과 연결 AdminUser 를 모두 soft-delete 한다. */
    public EmployeeView terminate(String loginId, LocalDate terminationDate, String actor) {
        ArologisEmployee employee = findEmployee(loginId);
        String deletedBy = actorOrSystem(actor);
        employee.terminate(terminationDate, deletedBy);
        employee.getAdminUser().markDeleted(deletedBy);
        return EmployeeView.from(employee);
    }

    /** 부서/재직 필터 직원 목록. UUID 는 응답하지 않는다. */
    @Transactional(readOnly = true)
    public List<EmployeeView> list(String departmentCode, Boolean activeOnly) {
        return employeeRepository.searchActive(blankToNull(departmentCode), activeOnly).stream()
                .map(EmployeeView::from)
                .toList();
    }

    /** 직원 롤 변경 이력 조회. */
    @Transactional(readOnly = true)
    public List<RoleHistoryView> roleHistories(String loginId) {
        ArologisEmployee employee = findEmployee(loginId);
        return historyRepository.findAllByEmployeeIdAndIsDeletedFalseOrderByCreatedAtDesc(employee.getId()).stream()
                .map(RoleHistoryView::from)
                .toList();
    }

    private void assertUniqueLoginId(String loginId) {
        if (adminUserRepository.findByLoginIdAndIsDeletedFalse(loginId).isPresent()
                || employeeRepository.findByLoginIdAndIsDeletedFalse(loginId).isPresent()) {
            throw new BusinessException(ErrorCode.CONFLICT, "이미 사용 중인 로그인 ID입니다.");
        }
    }

    private ArologisEmployee findEmployee(String loginId) {
        return employeeRepository.findByLoginIdAndIsDeletedFalse(loginId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "직원을 찾을 수 없습니다."));
    }

    private ArologisDepartment findDepartment(String departmentCode) {
        return departmentRepository.findByCodeAndIsDeletedFalse(departmentCode)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "부서를 찾을 수 없습니다."));
    }

    private String generateTemporaryPassword() {
        StringBuilder password = new StringBuilder(TEMP_PASSWORD_LENGTH);
        for (int i = 0; i < TEMP_PASSWORD_LENGTH; i++) {
            password.append(PASSWORD_CHARS[secureRandom.nextInt(PASSWORD_CHARS.length)]);
        }
        return password.toString();
    }

    private static String actorOrSystem(String actor) {
        return actor == null || actor.isBlank() ? "system" : actor;
    }

    private static String blankToNull(String raw) {
        return raw == null || raw.isBlank() ? null : raw;
    }

    /** 직원 생성 command. */
    public record CreateEmployeeCommand(
            String loginId,
            String fullName,
            String position,
            String departmentCode,
            LocalDate hireDate,
            String email,
            String phone,
            AdminUserRole role) {
    }

    /** 직원 수정 command. */
    public record UpdateEmployeeCommand(
            String fullName,
            String position,
            String departmentCode,
            String email,
            String phone) {
    }

    /** 직원 생성 응답. 임시 비밀번호는 최초 1회만 반환한다. */
    public record ProvisionedEmployee(EmployeeView employee, String temporaryPassword) {
    }

    /** UUID 없는 직원 응답. */
    public record EmployeeView(
            String loginId,
            String fullName,
            String position,
            String departmentCode,
            String departmentName,
            LocalDate hireDate,
            LocalDate terminationDate,
            String email,
            String phone,
            AdminUserRole role,
            boolean active) {

        public static EmployeeView from(ArologisEmployee employee) {
            return new EmployeeView(
                    employee.getLoginId(),
                    employee.getFullName(),
                    employee.getPosition(),
                    employee.getDepartment().getCode(),
                    employee.getDepartment().getName(),
                    employee.getHireDate(),
                    employee.getTerminationDate(),
                    employee.getEmail(),
                    employee.getPhone(),
                    employee.getAdminUser().getRole(),
                    employee.getTerminationDate() == null && !Boolean.TRUE.equals(employee.getIsDeleted()));
        }
    }

    /** UUID 없는 롤 변경 이력 응답. */
    public record RoleHistoryView(
            AdminUserRole previousRole,
            AdminUserRole newRole,
            String reason,
            LocalDateTime changedAt,
            String changedBy) {

        public static RoleHistoryView from(ArologisRoleChangeHistory history) {
            return new RoleHistoryView(
                    history.getPreviousRole(),
                    history.getNewRole(),
                    history.getReason(),
                    history.getCreatedAt(),
                    history.getCreatedBy());
        }
    }
}
