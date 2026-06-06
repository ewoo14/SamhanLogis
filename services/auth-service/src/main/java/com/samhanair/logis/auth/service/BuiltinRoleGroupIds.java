package com.samhanair.logis.auth.service;

import com.samhanair.logis.auth.domain.AccountGroup;
import com.samhanair.logis.common.security.Role;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * V43 마이그레이션에서 결정적으로 확정된 역할별 빌트인 권한그룹 UUID 매핑 상수.
 *
 * <p>UUID 체계: {@code 00000000-0000-0000-0000-0000000001XX} (10진수).
 * <ul>
 *   <li>MASTER    = 100 ({@code ...000100}, isSystemMaster=TRUE)</li>
 *   <li>MANAGER   = 101 ({@code ...000101}, isBuiltin=TRUE)</li>
 *   <li>SALES     = 102 ({@code ...000102})</li>
 *   <li>WAREHOUSE = 103 ({@code ...000103})</li>
 *   <li>ACCOUNTANT= 104 ({@code ...000104})</li>
 *   <li>INVENTORY = 105 ({@code ...000105})</li>
 *   <li>DISPATCH  = 106 ({@code ...000106})</li>
 *   <li>DRIVER    = 107 ({@code ...000107})</li>
 *   <li>STAFF     = 108 ({@code ...000108})</li>
 *   <li>DEVELOPER = 109 ({@code ...000109})</li>
 * </ul>
 *
 * <p>이 상수 맵은 V43 SQL 과 1:1 대응하며, 변경 시 반드시 Flyway 마이그레이션과 함께 동기화해야 한다.
 */
public final class BuiltinRoleGroupIds {

    /** 역할 → 빌트인 권한그룹 UUID 결정적 매핑. V43 참조. */
    public static final Map<Role, UUID> BUILTIN_ROLE_GROUP_IDS = Map.of(
            Role.MASTER,      UUID.fromString("00000000-0000-0000-0000-000000000100"),
            Role.MANAGER,     UUID.fromString("00000000-0000-0000-0000-000000000101"),
            Role.SALES,       UUID.fromString("00000000-0000-0000-0000-000000000102"),
            Role.WAREHOUSE,   UUID.fromString("00000000-0000-0000-0000-000000000103"),
            Role.ACCOUNTANT,  UUID.fromString("00000000-0000-0000-0000-000000000104"),
            Role.INVENTORY,   UUID.fromString("00000000-0000-0000-0000-000000000105"),
            Role.DISPATCH,    UUID.fromString("00000000-0000-0000-0000-000000000106"),
            Role.DRIVER,      UUID.fromString("00000000-0000-0000-0000-000000000107"),
            Role.STAFF,       UUID.fromString("00000000-0000-0000-0000-000000000108"),
            Role.DEVELOPER,   UUID.fromString("00000000-0000-0000-0000-000000000109")
    );

    /**
     * Phase C5-3 — UUID → 역할 역매핑 (PR-3 대비).
     *
     * <p>BUILTIN_ROLE_GROUP_IDS 의 역방향 Map. LoginResponse.role 파생 및
     * 그룹 UUID 에서 역할 라벨을 추론할 때 사용한다.
     */
    public static final Map<UUID, Role> GROUP_ID_TO_ROLE;

    static {
        Map<UUID, Role> reverse = new HashMap<>();
        BUILTIN_ROLE_GROUP_IDS.forEach((role, uuid) -> reverse.put(uuid, role));
        GROUP_ID_TO_ROLE = java.util.Collections.unmodifiableMap(reverse);
    }

    private BuiltinRoleGroupIds() {
        // 인스턴스화 금지
    }

    /**
     * 주어진 역할의 빌트인 권한그룹 UUID 를 반환한다.
     *
     * @param role 역할 enum
     * @return 해당 역할의 빌트인 권한그룹 UUID (Optional)
     */
    public static Optional<UUID> of(Role role) {
        if (role == null) {
            return Optional.empty();
        }
        return Optional.ofNullable(BUILTIN_ROLE_GROUP_IDS.get(role));
    }

    /**
     * Phase C5-3 신규 — 빌트인 그룹 UUID 에서 역할 enum 을 역매핑한다 (PR-3 대비).
     *
     * <p>LoginResponse.role 을 그룹 UUID 집합에서 파생할 때 사용한다.
     * 빌트인 그룹이 아닌 UUID 는 {@link Optional#empty()} 반환.
     *
     * @param groupId 권한그룹 UUID
     * @return 해당 UUID 에 대응하는 역할 enum (Optional)
     */
    public static Optional<Role> fromGroupId(UUID groupId) {
        if (groupId == null) {
            return Optional.empty();
        }
        return Optional.ofNullable(GROUP_ID_TO_ROLE.get(groupId));
    }

    /**
     * P2 공통 헬퍼 — 계정의 활성 그룹 배속 목록에서 빌트인 역할을 역매핑하여 반환한다.
     *
     * <p>login / /me / listAccounts 3곳의 중복 역매핑 로직을 단일 진실원으로 통합.
     * groupId 오름차순 정렬된 {@code activeGroups} 에서 빌트인 UUID 에 대응하는 첫 번째 역할을 반환하며,
     * 해당 결과가 없으면 빈 문자열을 반환한다.
     *
     * <p>역매핑 실패(빌트인 그룹 미배속)는 배속 누락 전용 fallback 으로 빈 문자열을 반환한다.
     * 이 경우 {@code log.warn} 으로 추적 가능하도록 {@code accountId} 를 함께 기록한다.
     * 인가 흐름(X-User-Groups / X-Is-System-Master)에는 영향이 없다.
     *
     * @param activeGroups  계정의 활성 AccountGroup 목록 (is_deleted=false)
     * @param accountIdHint 경고 로그용 계정 식별자 (UUID 또는 loginId 문자열)
     * @return 역할 이름 문자열, 빌트인 그룹 미매핑 시 빈 문자열
     */
    public static String deriveRoleName(List<AccountGroup> activeGroups, Object accountIdHint) {
        return activeGroups.stream()
                .map(ag -> fromGroupId(ag.getGroupId()))
                .filter(Optional::isPresent)
                .map(Optional::get)
                .map(Role::name)
                .findFirst()
                .orElseGet(() -> {
                    // 배속 누락 전용 fallback — 인가 불변식 무영향이지만 추적 필요
                    org.slf4j.LoggerFactory.getLogger(BuiltinRoleGroupIds.class)
                            .warn("[BuiltinRoleGroupIds] 빌트인 role-group 미배속 계정 감지 — accountId={}", accountIdHint);
                    return "";
                });
    }
}
