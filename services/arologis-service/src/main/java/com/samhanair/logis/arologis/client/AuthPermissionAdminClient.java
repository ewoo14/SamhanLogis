package com.samhanair.logis.arologis.client;

import java.util.Map;

/**
 * auth-service 내부 권한 관리 엔드포인트 호출 client.
 *
 * <p>아로로지스 백오피스 Phase A 권한 관리 화면이 중앙 {@code role_page_permissions} 의
 * arologis.* 도메인 grant 매트릭스를 조회·할당하기 위해 사용한다. auth-service
 * {@code /auth/internal/permissions/role-matrix} / {@code role-grant} 엔드포인트를
 * {@code X-Internal-Token} 헤더로 호출한다.
 *
 * <p>도메인 스코프 가드(read prefix={@code "arologis."} / write {@code startsWith("arologis.")})는
 * 호출 컨트롤러({@code ArologisPermissionAdminController})에서 강제한다 — 본 client 는 전달만 한다.
 */
public interface AuthPermissionAdminClient {

    /**
     * 페이지-코드 prefix 로 스코프한 롤별 권한 매트릭스 조회.
     *
     * @param pagePrefix 페이지 코드 prefix (필수 — 예: {@code "arologis."})
     * @return roleCode → pageCode → 권한 정보 매트릭스
     */
    Map<String, Map<String, RolePagePermissionView>> getRoleMatrix(String pagePrefix);

    /**
     * 단일 롤-페이지 grant upsert.
     *
     * <p>{@code canEdit=true} 인 경우 중앙 도메인 규칙상 {@code canView} 도 자동 true 로 보장된다.
     *
     * <p>{@code actorUserId} 는 게이트웨이/JwtFilter 가 주입한 실 사용자 식별자로, auth role-grant
     * 호출 시 {@code X-User-Id} 헤더로 전파되어 감사 기록의 actor 로 사용된다(하드코딩 system-internal
     * 대신). blank/null 이면 client 가 service-internal 식별자로 폴백한다.
     *
     * @param roleCode    역할 코드
     * @param pageCode    페이지 코드 (arologis.* — 가드는 호출 컨트롤러에서)
     * @param canView     조회 권한 부여 여부
     * @param canEdit     편집 권한 부여 여부
     * @param actorUserId 실 actor 식별자 (X-User-Id 헤더, null 가능)
     * @return upsert 결과 권한 정보
     */
    RolePagePermissionView updateRoleGrant(
            String roleCode, String pageCode, boolean canView, boolean canEdit, String actorUserId);

    /**
     * 롤-페이지 권한 응답 뷰 (UUID 비공개 — roleCode/pageCode 비즈니스 키만 노출).
     *
     * @param roleCode    역할 코드
     * @param pageCode    페이지 코드
     * @param displayName 페이지 한국어 명칭
     * @param canView     조회 권한 여부
     * @param canEdit     편집 권한 여부
     */
    record RolePagePermissionView(
            String roleCode,
            String pageCode,
            String displayName,
            boolean canView,
            boolean canEdit) {
    }
}
