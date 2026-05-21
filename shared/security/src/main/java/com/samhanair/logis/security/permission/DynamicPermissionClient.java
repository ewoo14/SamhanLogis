package com.samhanair.logis.security.permission;

/**
 * 동적 RBAC 권한 조회 클라이언트 공통 인터페이스 — SP-D5 통합 + SP-D6 (MIG-23) 단일 구현 통합.
 *
 * <p>SP-D1~D4 에서 각 service(accounting/arologis/inventory/notification/partner-order/partner/
 * product/slip/user) 가 자체 패키지에 중복 정의하던 동일 인터페이스를 SP-D5 에서
 * {@code shared:security} 모듈로 일원화. SP-D6 (MIG-23) 에서 9 service 의 service-local
 * {@link DefaultDynamicPermissionClient} 9 파일을 단일 구현으로 통합 + service-local interface 9 파일
 * 모두 삭제. 기본 bean 등록은 {@link PermissionSecurityAutoConfiguration#defaultDynamicPermissionClient}
 * 가 담당하며, 소비자 service 가 자체 bean 을 정의하면 {@code @ConditionalOnMissingBean} 에
 * 의해 override.
 *
 * <p>auth-service {@code GET /auth/admin/permissions/check} 를 호출하여
 * 특정 역할의 특정 페이지 접근 가능 여부를 확인한다.
 *
 * <p>장애 격리 정책: auth-service 다운 또는 네트워크 오류 시 {@code false} 반환 (보수적 fallback).
 *
 * @since SP-D5
 */
public interface DynamicPermissionClient {

    /**
     * 특정 역할이 특정 페이지에 대한 조회(VIEW) 권한이 있는지 확인.
     *
     * <p>auth-service 조회 실패 시 {@code false} 반환 (보수적 fallback).
     *
     * @param roleCode 역할 코드 (예: {@code ACCOUNTANT}, {@code MANAGER})
     * @param pageCode 페이지 코드 (예: {@code accounting.reports}, {@code inventory.warehouse})
     * @return 조회 권한이 있으면 {@code true}, 없거나 조회 실패 시 {@code false}
     */
    boolean canView(String roleCode, String pageCode);

    /**
     * 특정 역할이 특정 페이지에 대한 편집(EDIT) 권한이 있는지 확인.
     *
     * <p>auth-service 조회 실패 시 {@code false} 반환 (보수적 fallback).
     * 기존 {@code @PreAuthorize} 가 이미 통과된 이후 추가 동적 검증이므로,
     * false 반환 시 403 를 직접 던지지 않고 호출부에서 판단.
     *
     * @param roleCode 역할 코드 (예: {@code ACCOUNTANT})
     * @param pageCode 페이지 코드 (예: {@code accounting.tax-invoice.emit-nts})
     * @return 편집 권한이 있으면 {@code true}, 없거나 조회 실패 시 {@code false}
     */
    boolean canEdit(String roleCode, String pageCode);
}
