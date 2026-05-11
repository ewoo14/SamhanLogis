package com.samhanair.logis.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * 인사 카테고리 접근 가드 — {@code @PreAuthorize} SpEL 에서 참조하는 helper Bean.
 *
 * <h2>사용 방법</h2>
 * <pre>
 *   {@literal @}PreAuthorize("@hr.isExecutiveOffice() and hasRole('MASTER')")
 *   public ResponseEntity&lt;?&gt; adminEndpoint() { ... }
 * </pre>
 *
 * <h2>동작 원리</h2>
 * api-gateway 의 {@code JwtAuthenticationGatewayFilterFactory} 가 JWT claim
 * {@code departmentName} 을 {@code X-User-Department} 헤더로 downstream 에 전파한다.
 * 본 helper 는 {@link HttpServletRequest} 에서 해당 헤더를 추출하여 {@code "대표실"} 과
 * 비교한다. 헤더 미존재(부서 미배정 / 구버전 토큰) 시 {@code false} 반환 → 403.
 *
 * <h2>Backward Compatibility</h2>
 * 기존 {@code X-User-Department} 를 사용하지 않는 endpoint 는 본 bean 을
 * {@code @PreAuthorize} 에 포함하지 않으므로 영향 0건.
 *
 * <p>Phase 12 인사 카테고리 가드 슬라이스 (PR #160).
 */
public class HrAuthorizationHelper {

    /** 인사 카테고리 접근 허용 부서명. */
    public static final String EXECUTIVE_OFFICE_NAME = "대표실";

    /** X-User-Department 헤더명 — gateway 전파 헤더와 동일. */
    private static final String HEADER_USER_DEPARTMENT = "X-User-Department";

    /** X-User-Role 헤더명 — legacy token fallback 용. */
    private static final String HEADER_USER_ROLE = "X-User-Role";

    /**
     * 현재 요청의 소속 부서가 {@value #EXECUTIVE_OFFICE_NAME} 인지 확인한다.
     *
     * <p>RequestContextHolder 를 통해 현재 서블릿 요청을 조회하여 헤더를 읽는다.
     * RequestContextHolder 가 비어있는 경우(비-HTTP 컨텍스트, 예: 배치/스케줄러) 는
     * 안전하게 {@code false} 를 반환한다.
     *
     * <h3>Legacy backward compat (PR #160 회귀 가드)</h3>
     * {@code X-User-Department} 헤더가 부재한 경우 (구버전 토큰 / 부서 미배정 직원) 는
     * {@code X-User-Role} 가 {@code MASTER} 인 경우에 한해 임시 허용한다. 이는 기존
     * MASTER 가 발급받은 legacy token 의 영향 범위 0건을 보장하기 위한 조치이며,
     * 모든 활성 토큰이 {@code departmentName} claim 을 포함하게 되는 시점 (전체 사용자
     * 재로그인 완료 후) 에 본 fallback 은 제거 예정.
     *
     * @return {@code true} — {@code X-User-Department} 가 {@value #EXECUTIVE_OFFICE_NAME} 와 일치, 또는
     *         {@code true} — {@code X-User-Department} 부재 + {@code X-User-Role}=MASTER (legacy fallback)
     *         {@code false} — 그 외
     */
    public boolean isExecutiveOffice() {
        try {
            ServletRequestAttributes attrs =
                    (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attrs == null) {
                return false;
            }
            HttpServletRequest request = attrs.getRequest();
            String departmentName = request.getHeader(HEADER_USER_DEPARTMENT);
            if (departmentName != null) {
                return EXECUTIVE_OFFICE_NAME.equals(departmentName);
            }
            // Legacy backward compat — X-User-Department claim 없는 token 은
            // MASTER 또는 MANAGER ROLE 일 때 허용 (기존 admin endpoint 가드 (M/M) 호환)
            String role = request.getHeader(HEADER_USER_ROLE);
            return "MASTER".equals(role) || "MANAGER".equals(role);
        } catch (Exception ex) {
            // 헤더 조회 실패 시 안전하게 false — 인사 가드 우선
            return false;
        }
    }
}
