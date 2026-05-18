package com.samhanair.logis.partnerorder.client;

/**
 * 동적 RBAC 권한 조회 클라이언트 인터페이스 — SP-D4 partner-order-service 이식.
 *
 * @deprecated SP-D5 에서 {@link com.samhanair.logis.security.permission.DynamicPermissionClient}
 *             로 일원화되었습니다. SP-D6+ 시점에 공통 인터페이스로 교체 예정. 현재는 후방 호환 유지.
 */
@Deprecated(since = "SP-D5", forRemoval = false)
public interface DynamicPermissionClient {

    /**
     * 특정 역할이 특정 페이지에 대한 편집(EDIT) 권한이 있는지 확인.
     *
     * @param roleCode 역할 코드 (예: SALES)
     * @param pageCode 페이지 코드 (예: sales.partner-order.list)
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
