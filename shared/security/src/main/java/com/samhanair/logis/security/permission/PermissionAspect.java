package com.samhanair.logis.security.permission;

import jakarta.servlet.http.HttpServletRequest;
import java.lang.reflect.Parameter;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * {@link RequirePermission} 어노테이션 기반 동적 RBAC 권한 검증 AOP — SP-D5 신규.
 *
 * <p>Controller 메서드에 {@code @RequirePermission(page="...", action="VIEW|EDIT")} 를 부착하면
 * 본 Aspect 가 메서드 실행 전에 {@link DynamicPermissionClient} 를 통해 동적 권한을 검증한다.
 *
 * <p>X-User-Role 헤더 추출 순서:
 * <ol>
 *   <li>메서드 파라미터 중 {@code @RequestHeader("X-User-Role")} 또는
 *       {@code @RequestHeader(value="X-User-Role")} 어노테이션이 붙은 첫 번째 String 파라미터</li>
 *   <li>없으면 {@link RequestContextHolder} → {@link HttpServletRequest} 헤더에서 직접 추출</li>
 *   <li>둘 다 없으면 null 로 처리 (PermissionGuard 와 동일하게 건너뜀)</li>
 * </ol>
 *
 * <p>deny 정책 (action="VIEW" / "EDIT"):
 * <ul>
 *   <li>VIEW: {@link DynamicPermissionClient#canView(String, String)} == false → deny</li>
 *   <li>EDIT: {@link DynamicPermissionClient#canEdit(String, String)} == false +
 *       canView == true → deny (view-only override); canView == false → fallback 통과</li>
 * </ul>
 *
 * <p>deny 시: {@link PermissionGuardMetrics#incrementDenied(String, String, String, String)} 호출
 * 후 {@link AccessDeniedException} throw.
 *
 * <p>{@link DynamicPermissionClient} 는 service 별로 다른 bean 이므로
 * {@link ObjectProvider} 를 통한 lazy 주입으로 bean 미존재 시 NoSuchBeanDefinitionException 회피.
 * DynamicPermissionClient bean 이 없으면 권한 검증을 건너뛴다 (서비스 미지원 환경 호환).
 *
 * @see RequirePermission
 * @see PermissionGuardMetrics
 * @since SP-D5
 */
@Aspect
@Component
public class PermissionAspect {

    private static final Logger log = LoggerFactory.getLogger(PermissionAspect.class);

    /** X-User-Role 헤더 이름 — api-gateway 전파 표준. */
    private static final String ROLE_HEADER = "X-User-Role";

    private final ObjectProvider<DynamicPermissionClient> clientProvider;
    private final PermissionGuardMetrics metrics;

    /**
     * 생성자 주입.
     *
     * @param clientProvider DynamicPermissionClient lazy provider (service 별 bean)
     * @param metrics        deny 횟수 카운터 컴포넌트
     */
    public PermissionAspect(
            ObjectProvider<DynamicPermissionClient> clientProvider,
            PermissionGuardMetrics metrics) {
        this.clientProvider = clientProvider;
        this.metrics = metrics;
    }

    /**
     * {@link RequirePermission} 메서드 인터셉터.
     *
     * <p>메서드 실행 전 권한 검증 후 통과 시 원본 메서드를 실행한다.
     *
     * @param joinPoint AOP 조인 포인트
     * @return 원본 메서드 반환값
     * @throws Throwable deny 시 {@link AccessDeniedException}, 원본 메서드 예외 전파
     */
    @Around("@annotation(com.samhanair.logis.security.permission.RequirePermission)")
    public Object checkPermission(ProceedingJoinPoint joinPoint) throws Throwable {
        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        RequirePermission annotation = signature.getMethod()
                .getAnnotation(RequirePermission.class);

        String page   = annotation.page();
        String action = annotation.action() == null || annotation.action().isBlank()
                        ? "VIEW" : annotation.action().toUpperCase();

        // DynamicPermissionClient bean 없으면 건너뜀 (서비스 미지원 환경)
        DynamicPermissionClient client = clientProvider.getIfAvailable();
        if (client == null) {
            log.debug("[SP-D5] DynamicPermissionClient bean 없음 — 권한 검증 건너뜀 (page={} action={})",
                    page, action);
            return joinPoint.proceed();
        }

        // X-User-Role 헤더 추출
        String roleCode = extractRoleCode(joinPoint, signature);
        if (roleCode == null || roleCode.isBlank()) {
            log.debug("[SP-D5] X-User-Role 헤더 없음 — 권한 검증 건너뜀 (page={} action={})", page, action);
            return joinPoint.proceed();
        }

        // service 이름 추론 (Controller 클래스 패키지 기반)
        String serviceName = resolveServiceName(joinPoint);

        boolean denied = false;
        if ("VIEW".equals(action)) {
            boolean canView = client.canView(roleCode, page);
            if (!canView) {
                denied = true;
                log.debug("[SP-D5] VIEW 권한 deny — service={} page={} role={}", serviceName, page, roleCode);
            }
        } else if ("EDIT".equals(action)) {
            boolean canEdit = client.canEdit(roleCode, page);
            if (!canEdit) {
                boolean canView = client.canView(roleCode, page);
                if (canView) {
                    denied = true;
                    log.debug("[SP-D5] EDIT 권한 deny (view-only override) — service={} page={} role={}",
                            serviceName, page, roleCode);
                }
                // canView=false → fallback 통과 (override row 없음 — @PreAuthorize 가 이미 검증)
            }
        } else {
            // 미지원 action → 건너뜀
            log.warn("[SP-D5] 지원하지 않는 action 값 — action={} (page={}) → 건너뜀", action, page);
        }

        if (denied) {
            metrics.incrementDenied(serviceName, page, roleCode, action);
            throw new AccessDeniedException(
                    String.format("[SP-D5] 동적 권한 deny — page=%s action=%s role=%s", page, action, roleCode));
        }

        return joinPoint.proceed();
    }

    // -----------------------------------------------------------------------
    // private helpers
    // -----------------------------------------------------------------------

    /**
     * 메서드 파라미터 또는 HttpServletRequest 에서 X-User-Role 헤더 값 추출.
     *
     * @param joinPoint AOP 조인 포인트
     * @param signature 메서드 시그니처
     * @return 역할 코드 문자열, 없으면 null
     */
    private String extractRoleCode(ProceedingJoinPoint joinPoint, MethodSignature signature) {
        Parameter[] parameters = signature.getMethod().getParameters();
        Object[]    args       = joinPoint.getArgs();

        // 1) @RequestHeader("X-User-Role") 파라미터에서 추출
        for (int i = 0; i < parameters.length; i++) {
            RequestHeader rh = parameters[i].getAnnotation(RequestHeader.class);
            if (rh != null) {
                String headerName = rh.value().isBlank() ? rh.name() : rh.value();
                if (ROLE_HEADER.equalsIgnoreCase(headerName) && args[i] instanceof String) {
                    return (String) args[i];
                }
            }
        }

        // 2) RequestContextHolder → HttpServletRequest 에서 추출
        try {
            ServletRequestAttributes attrs =
                    (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attrs != null) {
                HttpServletRequest request = attrs.getRequest();
                return request.getHeader(ROLE_HEADER);
            }
        } catch (Exception e) {
            log.debug("[SP-D5] HttpServletRequest 에서 X-User-Role 추출 실패: {}", e.getMessage());
        }

        return null;
    }

    /**
     * Controller 클래스의 패키지 이름에서 service 식별자를 추론.
     *
     * <p>패키지 규칙: {@code com.samhanair.logis.<service>.<...>}
     * 예: {@code com.samhanair.logis.accounting.report.BalanceSheetController} → {@code "accounting"}
     *
     * @param joinPoint AOP 조인 포인트
     * @return service 이름 (추론 실패 시 {@code "unknown"})
     */
    private String resolveServiceName(ProceedingJoinPoint joinPoint) {
        String packageName = joinPoint.getTarget().getClass().getPackageName();
        // com.samhanair.logis.<service>.*
        String prefix = "com.samhanair.logis.";
        if (packageName.startsWith(prefix)) {
            String rest = packageName.substring(prefix.length());
            int dot = rest.indexOf('.');
            return dot > 0 ? rest.substring(0, dot) : rest;
        }
        return "unknown";
    }
}
