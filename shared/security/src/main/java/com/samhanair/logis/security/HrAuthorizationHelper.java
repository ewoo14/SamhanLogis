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

    /**
     * 현재 요청의 소속 부서가 {@value #EXECUTIVE_OFFICE_NAME} 인지 확인한다.
     *
     * <p>RequestContextHolder 를 통해 현재 서블릿 요청을 조회하여 헤더를 읽는다.
     * RequestContextHolder 가 비어있는 경우(비-HTTP 컨텍스트, 예: 배치/스케줄러) 는
     * 안전하게 {@code false} 를 반환한다.
     *
     * @return {@code true} — {@code X-User-Department} 헤더 값이 {@value #EXECUTIVE_OFFICE_NAME} 와 일치
     *         {@code false} — 헤더 미존재 또는 값 불일치
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
            return EXECUTIVE_OFFICE_NAME.equals(departmentName);
        } catch (Exception ex) {
            // 헤더 조회 실패 시 안전하게 false — 인사 가드 우선
            return false;
        }
    }
}
