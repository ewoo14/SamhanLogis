package com.samhanair.logis.slip.web;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.PermissionAspect;
import com.samhanair.logis.slip.domain.SlipType;
import java.util.Set;

/**
 * 매입(INBOUND) 전표 조회 권한 정책 공통 guard.
 *
 * <p>구매관리 화면과 기존 전표 목록 API가 동일한 정책을 사용하도록 한 곳에서 관리한다.
 *
 * <p>허용 역할: {@code WAREHOUSE} / {@code MANAGER} / {@code MASTER}
 * <br>금지 역할: {@code INVENTORY} / {@code SALES} / {@code ACCOUNTANT} — 입고 전표 조회 미허용 (403)
 * <br>정책 근거: SP-03 권한 매트릭스 §4.2 — 입고(INBOUND) 전표는 창고 직군 전용.
 *
 * <p>Phase C5-4 그룹 기반 OR 판정 추가:
 * {@code X-User-Groups} 헤더의 그룹 집합과 아래 빌트인 그룹 UUID 집합의 교집합이 있거나
 * {@code X-Is-System-Master=true} 이면 role 검사 없이 통과한다.
 * role 경로는 잔존 토큰 호환을 위해 병행 유지.
 *
 * <p>빌트인 그룹 UUID 상수 (V43 참조 {@code BuiltinRoleGroupIds}):
 * <ul>
 *   <li>MASTER   = {@code 00000000-0000-0000-0000-000000000100}</li>
 *   <li>MANAGER  = {@code 00000000-0000-0000-0000-000000000101}</li>
 *   <li>WAREHOUSE = {@code 00000000-0000-0000-0000-000000000103}</li>
 * </ul>
 *
 * @see <a href="https://docs.samhanair.com/sp-03#section-4-2">SP-03 권한 매트릭스 §4.2</a>
 */
final class SlipPurchaseAccessGuard {

    /**
     * 빌트인 INBOUND 열람 허용 그룹 UUID 집합 — V43 BuiltinRoleGroupIds 참조.
     *
     * <p>slip 내부 상수로 선언 (공유 폭 최소화 — 공유 모듈 의존 추가 금지).
     * 변경 시 반드시 V43 Flyway 마이그레이션과 동기화 필요.
     */
    static final Set<String> INBOUND_ALLOWED_GROUP_IDS = Set.of(
            "00000000-0000-0000-0000-000000000100",  // MASTER   빌트인 그룹
            "00000000-0000-0000-0000-000000000101",  // MANAGER  빌트인 그룹
            "00000000-0000-0000-0000-000000000103"   // WAREHOUSE 빌트인 그룹
    );

    private SlipPurchaseAccessGuard() {
    }

    /**
     * INBOUND(매입) 전표 조회 시 허용 조건을 충족하지 않으면 {@link BusinessException}(FORBIDDEN) 을 발생시킨다.
     *
     * <p>하위 호환 오버로드 — role 만으로 판정 (그룹/isSystemMaster 미전달).
     * Phase C5-4 이전 호출처와의 backward compatibility 보장.
     */
    static void guardInboundPurchaseRead(SlipType slipType, String role) {
        guardInboundPurchaseRead(slipType, role, null, null);
    }

    /**
     * INBOUND(매입) 전표 조회 시 허용 조건을 충족하지 않으면 {@link BusinessException}(FORBIDDEN) 을 발생시킨다.
     *
     * <p>{@code slipType} 이 {@code INBOUND} 가 아니면 즉시 반환.
     *
     * <p>허용 조건 (OR):
     * <ol>
     *   <li>isSystemMaster == "true" → bypass</li>
     *   <li>role ∈ {WAREHOUSE, MANAGER, MASTER} → 허용 (잔존 토큰 호환)</li>
     *   <li>groups ∩ {@link #INBOUND_ALLOWED_GROUP_IDS} ≠ ∅ → 허용 (Phase C5-4)</li>
     * </ol>
     *
     * @param slipType       전표 유형 (null 이면 가드 스킵)
     * @param role           X-User-Role 헤더 값 (null/blank 이면 그룹 경로로만 판정)
     * @param userGroups     X-User-Groups 헤더 값 comma-join (null/blank 이면 빈 Set)
     * @param isSystemMaster X-Is-System-Master 헤더 값 ("true" 이면 bypass)
     * @throws BusinessException FORBIDDEN — 모든 허용 조건 불충족 시
     */
    static void guardInboundPurchaseRead(SlipType slipType, String role,
                                         String userGroups, String isSystemMaster) {
        if (slipType != SlipType.INBOUND) {
            return;
        }
        if (canReadInboundPurchase(role, userGroups, isSystemMaster)) {
            return;
        }
        throw new BusinessException(ErrorCode.FORBIDDEN,
                "입고 전표 조회는 WAREHOUSE / MANAGER / MASTER 권한만 허용합니다.");
    }

    /**
     * {@code slipType} 이 null 이고 INBOUND 열람 권한이 없으면 OUTBOUND 만 허용하도록 강제한다.
     *
     * <p>하위 호환 오버로드 — role 만으로 판정.
     */
    static SlipType restrictInboundWhenTypeOmitted(SlipType slipType, String role) {
        return restrictInboundWhenTypeOmitted(slipType, role, null, null);
    }

    /**
     * {@code slipType} 이 null 이고 INBOUND 열람 권한이 없으면 OUTBOUND 만 허용하도록 강제한다.
     *
     * @param slipType       null 이면 전체 요청
     * @param role           X-User-Role 헤더 값
     * @param userGroups     X-User-Groups 헤더 값 (null 허용)
     * @param isSystemMaster X-Is-System-Master 헤더 값 (null 허용)
     * @return INBOUND 조회 가능하면 {@code slipType} 그대로 반환; 아니면 {@code SlipType.OUTBOUND}
     */
    static SlipType restrictInboundWhenTypeOmitted(SlipType slipType, String role,
                                                    String userGroups, String isSystemMaster) {
        if (slipType != null || canReadInboundPurchase(role, userGroups, isSystemMaster)) {
            return slipType;
        }
        return SlipType.OUTBOUND;
    }

    /**
     * 주어진 역할이 INBOUND 입고 전표를 조회할 수 있는지 여부.
     *
     * <p>하위 호환 오버로드 — role 만으로 판정.
     */
    static boolean canReadInboundPurchase(String role) {
        return canReadInboundPurchase(role, null, null);
    }

    /**
     * 주어진 역할/그룹/isSystemMaster 중 하나라도 허용 조건을 충족하면 true 를 반환한다.
     *
     * <p>판정 순서 (OR):
     * <ol>
     *   <li>isSystemMaster == "true" → bypass</li>
     *   <li>role ∈ {WAREHOUSE, MANAGER, MASTER} → 허용 (잔존 토큰 호환)</li>
     *   <li>userGroups ∩ {@link #INBOUND_ALLOWED_GROUP_IDS} ≠ ∅ → 허용 (Phase C5-4)</li>
     * </ol>
     *
     * @param role           X-User-Role 헤더 값 (null/blank 허용)
     * @param userGroups     X-User-Groups 헤더 comma-join 값 (null/blank 이면 빈 Set)
     * @param isSystemMaster X-Is-System-Master 헤더 값 ("true" 이면 bypass)
     * @return 허용 조건 충족 여부
     */
    static boolean canReadInboundPurchase(String role, String userGroups, String isSystemMaster) {
        if ("true".equalsIgnoreCase(isSystemMaster)) {
            return true;
        }
        if ("WAREHOUSE".equals(role) || "MANAGER".equals(role) || "MASTER".equals(role)) {
            return true;
        }
        Set<String> groups = PermissionAspect.parseGroupsHeader(userGroups);
        for (String groupId : groups) {
            if (INBOUND_ALLOWED_GROUP_IDS.contains(groupId)) {
                return true;
            }
        }
        return false;
    }
}
