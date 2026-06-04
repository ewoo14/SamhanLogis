package com.samhanair.logis.security.department;

import com.samhanair.logis.security.HrAuthorizationHelper;
import com.samhanair.logis.security.permission.PermissionGuardMetrics;
import jakarta.servlet.http.HttpServletRequest;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * {@link RequireDepartment} 어노테이션 기반 부서 게이트 AOP.
 *
 * <p>기존 {@code @PreAuthorize("@hr.isExecutiveOffice()")} 와 동일한
 * {@link HrAuthorizationHelper#isExecutiveOffice()} 빈 메서드를 호출하여 전후 판정 동일성을 보장한다.
 */
@Aspect
public class DepartmentAspect {

    private static final Logger log = LoggerFactory.getLogger(DepartmentAspect.class);

    private static final String ROLE_HEADER = "X-User-Role";
    private static final String DEPARTMENT_PAGE = "department";

    private final HrAuthorizationHelper hr;
    private final PermissionGuardMetrics metrics;
    private final String serviceName;

    /**
     * 생성자 주입.
     *
     * @param hr          기존 SpEL {@code @hr} 와 같은 {@link HrAuthorizationHelper} bean
     * @param metrics     deny 횟수 카운터
     * @param serviceName {@code spring.application.name} 값
     */
    public DepartmentAspect(HrAuthorizationHelper hr, PermissionGuardMetrics metrics, String serviceName) {
        this.hr = hr;
        this.metrics = metrics;
        this.serviceName = (serviceName == null || serviceName.isBlank()) ? "unknown" : serviceName;
    }

    /**
     * {@link RequireDepartment} 메서드/타입 인터셉터.
     *
     * @param joinPoint AOP 조인 포인트
     * @return 원본 메서드 반환값
     * @throws Throwable deny 시 {@link AccessDeniedException}, 원본 메서드 예외 전파
     */
    @Around("@annotation(com.samhanair.logis.security.department.RequireDepartment) "
            + "|| @within(com.samhanair.logis.security.department.RequireDepartment)")
    public Object checkDepartment(ProceedingJoinPoint joinPoint) throws Throwable {
        RequireDepartment annotation = resolveAnnotation(joinPoint);
        Department department = annotation.value();

        boolean allowed = switch (department) {
            case EXECUTIVE_OFFICE -> hr.isExecutiveOffice();
        };
        if (!allowed) {
            deny(department, normalizeRole(extractRole()));
        }
        return joinPoint.proceed();
    }

    private RequireDepartment resolveAnnotation(ProceedingJoinPoint joinPoint) {
        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        RequireDepartment annotation = signature.getMethod().getAnnotation(RequireDepartment.class);
        if (annotation != null) {
            return annotation;
        }
        Class<?> targetClass = joinPoint.getTarget().getClass();
        annotation = targetClass.getAnnotation(RequireDepartment.class);
        if (annotation != null) {
            return annotation;
        }
        return signature.getMethod().getDeclaringClass().getAnnotation(RequireDepartment.class);
    }

    private String extractRole() {
        try {
            ServletRequestAttributes attrs =
                    (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attrs != null) {
                HttpServletRequest request = attrs.getRequest();
                return request.getHeader(ROLE_HEADER);
            }
        } catch (Exception e) {
            log.debug("[PAM-M1] HttpServletRequest 에서 {} 추출 실패: {}", ROLE_HEADER, e.getMessage());
        }
        return null;
    }

    private String normalizeRole(String role) {
        return role == null || role.isBlank() ? "UNKNOWN" : role.trim();
    }

    private void deny(Department department, String role) {
        log.debug("[PAM-M1] 부서 deny — service={} department={} role={}", serviceName, department, role);
        metrics.incrementDenied(serviceName, DEPARTMENT_PAGE, role, department.name());
        throw new AccessDeniedException(
                String.format("[PAM-M1] 부서 권한 deny — department=%s role=%s", department, role));
    }
}
