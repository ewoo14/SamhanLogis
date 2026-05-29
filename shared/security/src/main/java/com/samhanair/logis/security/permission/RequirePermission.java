package com.samhanair.logis.security.permission;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 동적 RBAC 권한 검증 AOP 어노테이션 — SP-D5 신규.
 *
 * <p>Controller 메서드에 부착하면 {@link PermissionAspect} 가 메서드 실행 전에
 * {@link DynamicPermissionClient} 를 통해 동적 권한을 검증한다.
 *
 * <p>사용 예시:
 * <pre>{@code
 * @GetMapping("/warehouses")
 * @PreAuthorize("hasAnyRole('MASTER','MANAGER')")
 * @RequirePermission(page = "inventory.warehouse", action = PermissionAction.VIEW)
 * public ApiResponse<List<WarehouseResponse>> listAll(
 *         @RequestHeader(value = "X-User-Role", required = false) String roleHeader) {
 *     return ApiResponse.ok(warehouseService.listAll());
 * }
 * }</pre>
 *
 * <p>action 값:
 * <ul>
 *   <li>{@link PermissionAction#VIEW} — 조회 권한 검증</li>
 *   <li>{@link PermissionAction#CREATE} — 생성 권한 검증</li>
 *   <li>{@link PermissionAction#UPDATE} — 수정 권한 검증</li>
 *   <li>{@link PermissionAction#DELETE} — 삭제 권한 검증</li>
 *   <li>{@link PermissionAction#RESTORE} — 복원 권한 검증</li>
 *   <li>{@link PermissionAction#DOWNLOAD} — 다운로드 권한 검증</li>
 *   <li>{@link PermissionAction#PRINT} — 출력 권한 검증</li>
 * </ul>
 *
 * <p>X-User-Role 헤더 추출 순서:
 * <ol>
 *   <li>메서드 파라미터 중 {@code @RequestHeader("X-User-Role")} 어노테이션이 붙은 첫 번째 파라미터</li>
 *   <li>없으면 {@link jakarta.servlet.http.HttpServletRequest} 헤더에서 직접 추출</li>
 * </ol>
 *
 * @see PermissionAspect
 * @see PermissionGuardMetrics
 * @since SP-D5
 */
@Documented
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
public @interface RequirePermission {

    /**
     * 검증할 페이지 코드.
     *
     * <p>auth-service 의 권한 override 테이블에 저장된 페이지 코드와 일치해야 한다.
     * 예: {@code "inventory.warehouse"}, {@code "accounting.reports"}, {@code "partners.list"}.
     *
     * @return 페이지 코드 문자열
     */
    String page();

    /**
     * 검증할 액션 코드.
     *
     * <p>지원 값은 {@link PermissionAction} 7개 액션이다.
     *
     * @return 액션 enum
     */
    PermissionAction action() default PermissionAction.VIEW;

    /**
     * PARTNER 자기범위 self-service endpoint 여부.
     *
     * <p>{@code true} 인 경우 {@link PermissionAspect} 의 PARTNER 무조건 deny 를 면제한다.
     * 자기범위 검증은 service 계층 책임이며, 예를 들어 {@code PARTNER_CODE_HEADER} 로 전달된
     * 거래처 코드와 대상 리소스의 소유 거래처를 service 에서 반드시 대조해야 한다.
     *
     * <p>기본값은 {@code false} 이므로 명시적으로 opt-in 하지 않은 endpoint 의 기존 PARTNER
     * deny 정책은 변하지 않는다.
     *
     * @return PARTNER 자기범위 self-service endpoint 이면 true
     */
    boolean partnerSelfService() default false;
}
