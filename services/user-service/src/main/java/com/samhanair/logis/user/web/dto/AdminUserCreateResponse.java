package com.samhanair.logis.user.web.dto;

import com.samhanair.logis.common.security.Role;
import com.samhanair.logis.user.domain.Employee;
import java.util.UUID;

/**
 * {@code POST /api/v1/admin/users} 응답 — Phase 10 P0-5 신규 직원 등록.
 *
 * <p>{@link EmployeeResponse} 에 임시 비밀번호 평문을 추가한 확장 응답.
 * 임시 비밀번호는 이 응답에서만 1회 노출되며, 관리자가 직원에게 직접 전달하여야 함.
 * 첫 로그인 후 {@code passwordChangeRequired = true} 로 인해 비밀번호 변경이 강제됨.
 *
 * @param id                     직원 UUID (라우팅 키 전용 — 화면 라벨은 fullName/loginId 사용)
 * @param loginId                로그인 아이디
 * @param fullName               성명
 * @param role                   초기 역할
 * @param departmentId           소속 부서 UUID
 * @param departmentName         소속 부서명
 * @param email                  이메일
 * @param phoneNumber            전화번호
 * @param temporaryPassword      임시 비밀번호 평문 (이 응답에서만 1회 노출)
 * @param passwordChangeRequired 첫 로그인 후 비밀번호 변경 강제 여부 (항상 true)
 */
public record AdminUserCreateResponse(
        UUID id,
        String loginId,
        String fullName,
        Role role,
        UUID departmentId,
        String departmentName,
        String email,
        String phoneNumber,
        String temporaryPassword,
        boolean passwordChangeRequired) {

    /**
     * {@link Employee} + 임시 비밀번호로 응답 생성.
     *
     * @param employee          영속화된 직원 엔티티
     * @param temporaryPassword 임시 비밀번호 평문 (auth-service 로 전달된 값과 동일)
     */
    public static AdminUserCreateResponse from(Employee employee, String temporaryPassword) {
        return new AdminUserCreateResponse(
                employee.getId(),
                employee.getLoginId(),
                employee.getFullName(),
                employee.getRoleSnapshot(),
                employee.getDepartment().getId(),
                employee.getDepartment().getName(),
                employee.getEmail(),
                employee.getPhone(),
                temporaryPassword,
                true);
    }
}
