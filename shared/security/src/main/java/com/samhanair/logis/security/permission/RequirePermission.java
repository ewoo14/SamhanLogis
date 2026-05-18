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
 * @RequirePermission(page = "inventory.warehouse", action = "VIEW")
 * public ApiResponse<List<WarehouseResponse>> listAll(
 *         @RequestHeader(value = "X-User-Role", required = false) String roleHeader) {
 *     return ApiResponse.ok(warehouseService.listAll());
 * }
 * }</pre>
 *
 * <p>action 값:
 * <ul>
 *   <li>{@code "VIEW"} — 조회 권한 검증 ({@link DynamicPermissionClient#canView(String, String)})</li>
 *   <li>{@code "EDIT"} — 편집 권한 검증 ({@link DynamicPermissionClient#canEdit(String, String)})</li>
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
     * <p>지원 값: {@code "VIEW"} (조회), {@code "EDIT"} (편집).
     * 미지원 값 입력 시 {@link PermissionAspect} 가 {@code EDIT} 으로 fallback.
     *
     * @return 액션 코드 문자열
     */
    String action() default "VIEW";
}
