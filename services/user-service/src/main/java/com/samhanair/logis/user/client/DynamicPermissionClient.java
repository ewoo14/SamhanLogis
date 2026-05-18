package com.samhanair.logis.user.client;

/**
 * 동적 RBAC 권한 조회 클라이언트 인터페이스 — SP-D4 user-service 이식.
 *
 * <p>auth-service 의 {@code GET /auth/admin/permissions/check} endpoint 를 호출하여
 * 특정 역할의 특정 페이지 접근 가능 여부를 확인한다.
 *
 * <p>MSA 패턴: user-service 는 자체 DB 에 권한 정보를 갖지 않으므로
 * auth-service 를 통해 동적 권한을 조회한다.
 *
 * <p>이중 가드 정책:
 * <ul>
 *   <li>기존 {@code @PreAuthorize} 보존 (regression 0)</li>
 *   <li>canEdit=false + canView=true → 403 (view-only override deny)</li>
 *   <li>canEdit=false + canView=false → fallback 통과 (override row 없음)</li>
 *   <li>actorRole null/blank → 동적 검증 건너뜀</li>
 * </ul>
 *
 * <p>IT 에서 {@code @MockBean} 으로 격리 필요 (메모리 가드 {@code feedback_it_mockbean_external_clients.md}).
 */
public interface DynamicPermissionClient {

    /**
     * 특정 역할이 특정 페이지에 대한 편집(EDIT) 권한이 있는지 확인.
     *
     * @param roleCode 역할 코드 (예: MASTER)
     * @param pageCode 페이지 코드 (예: admin.employees)
     * @return 편집 권한이 있으면 {@code true}, 없거나 조회 실패 시 {@code false}
     */
    boolean canEdit(String roleCode, String pageCode);

    /**
     * 특정 역할이 특정 페이지에 대한 조회(VIEW) 권한이 있는지 확인.
     *
     * @param roleCode 역할 코드
     * @param pageCode 페이지 코드
     * @return 조회 권한이 있으면 {@code true}, 없거나 조회 실패 시 {@code false}
     */
    boolean canView(String roleCode, String pageCode);
}
