package com.samhanair.logis.user.web.dto;

import com.samhanair.logis.common.security.Role;
import java.util.UUID;

/**
 * 형제 service 가 받는 직원 정보 — Phase 9 W3 신규.
 *
 * <p>UUID 비공개 가드 — 본 응답은 형제 service 한정 (사용자 화면 직접 노출 X).
 *
 * @param id 직원 UUID
 * @param loginId 로그인 ID
 * @param fullName 성명
 * @param role role enum 스냅샷
 */
public record InternalUserResponse(
        UUID id,
        String loginId,
        String fullName,
        Role role,
        String departmentName,
        String ecountCode
) {
}
