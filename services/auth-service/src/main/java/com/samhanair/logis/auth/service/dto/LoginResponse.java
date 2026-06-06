package com.samhanair.logis.auth.service.dto;

import java.util.List;

/**
 * 로그인 성공 시 발급된 JWT 와 SPA 초기 렌더에 필요한 최소 프로파일을 담는 응답.
 *
 * <p>Phase C5-3 갱신 — {@code groups} 필드 추가:
 * 계정의 활성 그룹 요약 목록({@link GroupSummary})을 포함하여 FE 가 그룹 기반 인가를
 * 클라이언트 측에서 참조할 수 있도록 한다. UUID 는 FE 에 노출하지 않고(feedback_uuid_no_user_visibility),
 * 그룹 {@code name} 만 렌더링한다. groups 는 null 이 아닌 빈 리스트를 반환 보장.
 *
 * <p>기존 필드 ({@code token}, {@code userId}, {@code role}, {@code displayName}) 는 불변.
 *
 * @param token       JWT Bearer 토큰
 * @param userId      계정 UUID 문자열 (FE internal 용, 화면 미표시)
 * @param role        빌트인 그룹 역매핑 파생 역할 라벨 (FE 사이드바 배열 호환 유지)
 * @param displayName 화면 표시용 이름
 * @param groups      계정 활성 그룹 요약 목록 (null 미반환, 빈 리스트 가능)
 */
public record LoginResponse(
        String token,
        String userId,
        String role,
        String displayName,
        List<GroupSummary> groups) {

    /**
     * Phase C5-3 이전 호출처와의 하위 호환 생성자 — groups 를 빈 리스트로 초기화.
     *
     * @param token       JWT Bearer 토큰
     * @param userId      계정 UUID 문자열
     * @param role        역할 라벨
     * @param displayName 화면 표시용 이름
     */
    public LoginResponse(String token, String userId, String role, String displayName) {
        this(token, userId, role, displayName, List.of());
    }

    /**
     * 로그인 응답에 포함되는 그룹 요약.
     *
     * <p>UUID 는 FE 화면 렌더링 금지(feedback_uuid_no_user_visibility).
     * FE 는 {@code name} 만 표시한다.
     *
     * @param id      그룹 UUID 문자열 (FE internal 용)
     * @param name    그룹 표시명
     * @param builtin 빌트인 여부
     */
    public record GroupSummary(String id, String name, boolean builtin) {
    }
}

