package com.samhanair.logis.auth.web.dto;

import com.samhanair.logis.auth.service.dto.LoginResponse;
import java.util.List;

/**
 * {@code GET /auth/me} 응답 — 웹 새로고침 bootstrap 에 필요한 로그인 응답 식별정보와 정합을 맞춘다.
 *
 * @param userId      계정 UUID 문자열 (FE internal 용, 화면 미표시)
 * @param loginId     로그인 아이디
 * @param role        빌트인 그룹 역매핑 파생 역할 라벨
 * @param displayName 표시 이름
 * @param partnerCode 거래처 계정 자기범위 코드. 직원 auth-service 에서는 현재 null.
 * @param groups      계정 활성 그룹 요약 목록
 */
public record MeResponse(
        String userId,
        String loginId,
        String role,
        String displayName,
        String partnerCode,
        List<LoginResponse.GroupSummary> groups) {
}
