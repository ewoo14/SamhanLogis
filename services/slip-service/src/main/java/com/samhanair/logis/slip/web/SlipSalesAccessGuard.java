package com.samhanair.logis.slip.web;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.PermissionAspect;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.domain.SlipType;
import java.util.Set;

/**
 * 매출(OUTBOUND) 전표 조회 권한 정책 공통 guard.
 *
 * <p>SP-08-6-1 (매출 목록/상세 R1/R2 endpoint 잠금) 신규.
 * 매출 화면과 전표 단건 조회 API 가 동일한 정책을 사용하도록 한 곳에서 관리한다.
 *
 * <p>허용 역할: {@code SALES} / {@code MANAGER} / {@code MASTER}
 * <br>금지 역할: {@code INVENTORY} / {@code WAREHOUSE} — 출고 전표 조회 미허용 (403)
 * <br>정책 근거: SP-03 권한 매트릭스 §4.2 — 출고(OUTBOUND) 전표는 영업/관리 직군 전용.
 * 창고/재고 직군은 배송/검수 단계(ACCEPT~COMPLETE)만 처리권한, 목록 조회권 없음.
 *
 * <p>Phase C5-3 그룹 기반 OR 판정 추가:
 * {@code X-User-Groups} 헤더의 그룹 집합과 아래 빌트인 그룹 UUID 집합의 교집합이 있거나
 * {@code X-Is-System-Master=true} 이면 role 검사 없이 통과한다.
 * 기존 role 경로는 병행 유지 — behavior-preserving (락아웃 0).
 *
 * <p>빌트인 그룹 UUID 상수 (V43 참조 {@code BuiltinRoleGroupIds}):
 * <ul>
 *   <li>MASTER  = {@code 00000000-0000-0000-0000-000000000100}</li>
 *   <li>MANAGER = {@code 00000000-0000-0000-0000-000000000101}</li>
 *   <li>SALES   = {@code 00000000-0000-0000-0000-000000000102}</li>
 * </ul>
 *
 * @see <a href="https://docs.samhanair.com/sp-03#section-4-2">SP-03 권한 매트릭스 §4.2</a>
 */
final class SlipSalesAccessGuard {

    /**
     * 빌트인 OUTBOUND 열람 허용 그룹 UUID 집합 — V43 BuiltinRoleGroupIds 참조.
     *
     * <p>slip 내부 상수로 선언 (공유 폭 최소화 — 공유 모듈 의존 추가 금지).
     * 변경 시 반드시 V43 Flyway 마이그레이션과 동기화 필요.
     */
    static final Set<String> OUTBOUND_ALLOWED_GROUP_IDS = Set.of(
            "00000000-0000-0000-0000-000000000100",  // MASTER  빌트인 그룹
            "00000000-0000-0000-0000-000000000101",  // MANAGER 빌트인 그룹
            "00000000-0000-0000-0000-000000000102"   // SALES   빌트인 그룹
    );

    /** QR 최소 문맥에만 허용하는 창고·재고 그룹 UUID (전체 영업 상세에는 사용하지 않는다). */
    static final Set<String> OUTBOUND_SCAN_CONTEXT_GROUP_IDS = Set.of(
            "00000000-0000-0000-0000-000000000100",
            "00000000-0000-0000-0000-000000000101",
            "00000000-0000-0000-0000-000000000102",
            "00000000-0000-0000-0000-000000000103",
            "00000000-0000-0000-0000-000000000105"
    );

    private SlipSalesAccessGuard() {
    }

    /**
     * OUTBOUND(매출) 전표 조회 시 허용 조건을 충족하지 않으면 {@link BusinessException}(FORBIDDEN) 을 발생시킨다.
     *
     * <p>{@code slipType} 이 {@code OUTBOUND} 가 아니면 즉시 반환 (INBOUND 가드는 별도 {@link SlipPurchaseAccessGuard}).
     *
     * <p>허용 조건 (OR):
     * <ol>
     *   <li>검수 결재선 allowed 이고 검수 후속 전이 상태 — OUTBOUND 검수/배송 상태 경로</li>
     *   <li>role ∈ {SALES, MANAGER, MASTER} — 기존 role 경로 (병행 유지)</li>
     *   <li>groups ∩ {@link #OUTBOUND_ALLOWED_GROUP_IDS} ≠ ∅ — Phase C5-3 그룹 경로</li>
     *   <li>isSystemMaster == "true" — Phase C4 시스템 마스터 경로</li>
     * </ol>
     *
     * @param slipType      전표 유형 (null 이면 가드 스킵)
     * @param status        전표 상태 (검수 결재선 경로에는 검수 후속 전이 상태만 허용)
     * @param role          X-User-Role 헤더 값 (null/blank 이면 그룹 경로로만 판정)
     * @param userGroups    X-User-Groups 헤더 값 comma-join (null/blank 이면 빈 Set)
     * @param isSystemMaster X-Is-System-Master 헤더 값 ("true" 이면 bypass)
     * @param approvalLineAllowed 현재 계정이 OUTBOUND 검수 결재선에 포함되는지 여부
     * @throws BusinessException FORBIDDEN — 모든 허용 조건 불충족 시
     */
    static void guardOutboundSalesRead(SlipType slipType, SlipStatus status, String role,
                                       String userGroups, String isSystemMaster,
                                       boolean approvalLineAllowed) {
        if (slipType != SlipType.OUTBOUND) {
            return;
        }
        if (isOutboundInspectionApprovalStage(status) && approvalLineAllowed) {
            return;
        }
        if (canReadOutboundSales(role, userGroups, isSystemMaster)) {
            return;
        }
        throw new BusinessException(ErrorCode.FORBIDDEN,
                "출고 전표 조회는 SALES / MANAGER / MASTER 권한만 허용합니다.");
    }

    /** 검수 결재선 개인이 검수 완료 후 상세를 재조회할 수 있는 상태 범위. */
    private static boolean isOutboundInspectionApprovalStage(SlipStatus status) {
        return status == SlipStatus.INSPECTING
                || status == SlipStatus.COMPLETED
                || status == SlipStatus.SHIPPING
                || status == SlipStatus.DELIVERED
                || status == SlipStatus.CONFIRMED;
    }

    /**
     * 기존 role/group/system-master 경로만 사용하는 호환 오버로드.
     * 결재선 허용은 상태를 확인할 수 있는 단건 상세 조회에서만 추가한다.
     */
    static void guardOutboundSalesRead(SlipType slipType, String role,
                                       String userGroups, String isSystemMaster) {
        guardOutboundSalesRead(slipType, null, role, userGroups, isSystemMaster, false);
    }

    /**
     * 창고 QR 출고 전용 최소 문맥 조회 권한.
     * 전체 매출 상세 권한은 열지 않고 WAREHOUSE/INVENTORY만 별도 표면에 허용한다.
     */
    static void guardOutboundScanContext(SlipType slipType, String role,
                                          String userGroups, String isSystemMaster) {
        if (slipType != SlipType.OUTBOUND) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "QR 출고 문맥은 출고 전표만 허용합니다.");
        }
        if ("true".equalsIgnoreCase(isSystemMaster)
                || "SALES".equals(role) || "MANAGER".equals(role) || "MASTER".equals(role)
                || "WAREHOUSE".equals(role) || "INVENTORY".equals(role)) {
            return;
        }
        for (String groupId : PermissionAspect.parseGroupsHeader(userGroups)) {
            if (OUTBOUND_SCAN_CONTEXT_GROUP_IDS.contains(groupId)) {
                return;
            }
        }
        throw new BusinessException(ErrorCode.FORBIDDEN,
                "QR 출고 문맥 조회는 WAREHOUSE / INVENTORY / SALES / MANAGER / MASTER 권한만 허용합니다.");
    }

    /**
     * OUTBOUND(매출) 전표 조회 시 role 이 허용 목록에 없으면 {@link BusinessException}(FORBIDDEN) 을 발생시킨다.
     *
     * <p>하위 호환 오버로드 — 그룹/isSystemMaster 정보 없이 role 만으로 판정.
     * Phase C5-3 이전 호출처와의 backward compatibility 보장.
     *
     * @param slipType 전표 유형 (null 이면 가드 스킵)
     * @param role     X-User-Role 헤더 값 (null/blank 이면 403)
     * @throws BusinessException FORBIDDEN — role 미허용 시
     */
    static void guardOutboundSalesRead(SlipType slipType, String role) {
        guardOutboundSalesRead(slipType, role, null, null);
    }

    /**
     * {@code slipType} 이 null 이고 OUTBOUND 열람 권한이 없으면 INBOUND 만 허용하도록 강제한다.
     *
     * <p>type 미지정 전체 목록 조회 시 허용 조건 미충족 역할은 OUTBOUND 행을 볼 수 없다.
     * {@link SlipPurchaseAccessGuard#restrictInboundWhenTypeOmitted} 와 유사한 역할 제한.
     *
     * @param slipType      null 이면 전체 요청
     * @param role          X-User-Role 헤더 값
     * @param userGroups    X-User-Groups 헤더 값 (null 허용)
     * @param isSystemMaster X-Is-System-Master 헤더 값 (null 허용)
     * @return OUTBOUND 조회 가능하면 {@code slipType} 그대로 반환; 아니면 {@code SlipType.INBOUND}
     */
    static SlipType restrictOutboundWhenTypeOmitted(SlipType slipType, String role,
                                                     String userGroups, String isSystemMaster) {
        if (slipType != null || canReadOutboundSales(role, userGroups, isSystemMaster)) {
            return slipType;
        }
        return SlipType.INBOUND;
    }

    /**
     * {@code slipType} 이 null 이고 OUTBOUND 열람 권한이 없으면 INBOUND 만 허용하도록 강제한다.
     *
     * <p>하위 호환 오버로드 — role 만으로 판정.
     *
     * @param slipType null 이면 전체 요청
     * @param role     X-User-Role 헤더 값
     * @return OUTBOUND 조회 가능하면 {@code slipType} 그대로 반환; 아니면 {@code SlipType.INBOUND}
     */
    static SlipType restrictOutboundWhenTypeOmitted(SlipType slipType, String role) {
        return restrictOutboundWhenTypeOmitted(slipType, role, null, null);
    }

    /**
     * 주어진 역할/그룹/isSystemMaster 중 하나라도 허용 조건을 충족하면 true 를 반환한다.
     *
     * <p>판정 순서 (OR):
     * <ol>
     *   <li>isSystemMaster == "true" → bypass</li>
     *   <li>role ∈ {SALES, MANAGER, MASTER} → 허용 (기존 role 경로 병행 유지)</li>
     *   <li>userGroups ∩ {@link #OUTBOUND_ALLOWED_GROUP_IDS} ≠ ∅ → 허용 (Phase C5-3)</li>
     * </ol>
     *
     * @param role           X-User-Role 헤더 값 (null/blank 허용)
     * @param userGroups     X-User-Groups 헤더 comma-join 값 (null/blank 이면 빈 Set)
     * @param isSystemMaster X-Is-System-Master 헤더 값 ("true" 이면 bypass)
     * @return 허용 조건 충족 여부
     */
    static boolean canReadOutboundSales(String role, String userGroups, String isSystemMaster) {
        // Phase C4 경로 — X-Is-System-Master=true
        if ("true".equalsIgnoreCase(isSystemMaster)) {
            return true;
        }
        // 기존 role 경로 — behavior-preserving (병행 유지)
        // ACCOUNTANT 제외 — SP-03 권한 매트릭스 §4.2 (ACCOUNTANT 는 INBOUND 확정 권한만 보유)
        // INVENTORY / WAREHOUSE 제외 — 배송/검수 단계 처리 권한만 있고 출고 전표 열람 불가
        if ("SALES".equals(role) || "MANAGER".equals(role) || "MASTER".equals(role)) {
            return true;
        }
        // Phase C5-3 그룹 경로 — 파싱은 shared 공유 단일 구현 사용 (dual review P2: 중복 구현 금지)
        Set<String> groups = PermissionAspect.parseGroupsHeader(userGroups);
        for (String groupId : groups) {
            if (OUTBOUND_ALLOWED_GROUP_IDS.contains(groupId)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 주어진 역할이 OUTBOUND 출고 전표를 조회할 수 있는지 여부.
     *
     * <p>하위 호환 오버로드 — role 만으로 판정.
     *
     * @param role X-User-Role 헤더 값
     * @return SALES / MANAGER / MASTER 이면 true, 그 외 false
     */
    static boolean canReadOutboundSales(String role) {
        return canReadOutboundSales(role, null, null);
    }

}
