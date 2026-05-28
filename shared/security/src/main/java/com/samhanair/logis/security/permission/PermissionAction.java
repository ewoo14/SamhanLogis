package com.samhanair.logis.security.permission;

/**
 * 계정 단위 권한에서 사용하는 7개 액션.
 *
 * <p>DB 컬럼은 {@link #column()} 으로 {@code can_*} 형태에 매핑한다.
 */
public enum PermissionAction {
    VIEW,
    CREATE,
    UPDATE,
    DELETE,
    RESTORE,
    DOWNLOAD,
    PRINT;

    /**
     * 문자열을 대소문자 무관하게 액션으로 변환한다.
     *
     * @param raw 입력 문자열
     * @return 변환된 액션
     * @throws IllegalArgumentException 지원하지 않는 액션이면 발생
     */
    public static PermissionAction from(String raw) {
        PermissionAction action = fromOrNull(raw);
        if (action == null) {
            throw new IllegalArgumentException("지원하지 않는 action: " + raw);
        }
        return action;
    }

    /**
     * 문자열을 액션으로 변환하고, 미지원 값은 null 로 반환한다.
     *
     * @param raw 입력 문자열
     * @return 변환된 액션 또는 null
     */
    public static PermissionAction fromOrNull(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return PermissionAction.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    /**
     * {@code account_page_permissions} / {@code role_page_permission_templates} 컬럼명.
     *
     * @return {@code can_view} 같은 컬럼명
     */
    public String column() {
        return "can_" + name().toLowerCase();
    }
}
