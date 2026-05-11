package com.samhanair.logis.auth.web.dto.internal;

/**
 * 소속 부서명 내부 동기화 요청 DTO — Phase 12 인사 카테고리 가드.
 *
 * <p>user-service 가 직원 등록/부서 변경 시 auth-service {@code /auth/internal/accounts/{id}/department-name}
 * 로 호출하여 JWT claim 에 포함될 부서명을 갱신한다.
 *
 * @param departmentName 신규 부서명 (null = 부서 미배정)
 */
public record UpdateDepartmentNameInternalRequest(String departmentName) {
}
