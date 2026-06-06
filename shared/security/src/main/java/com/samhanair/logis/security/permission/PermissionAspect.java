package com.samhanair.logis.security.permission;

import jakarta.servlet.http.HttpServletRequest;
import java.lang.reflect.Parameter;
import java.util.UUID;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * {@link RequirePermission} 어노테이션 기반 동적 RBAC 권한 검증 AOP — SP-D5 신규.
 *
 * <p>Controller 메서드에 {@code @RequirePermission(page="...", action=PermissionAction.CREATE)} 를 부착하면
 * 본 Aspect 가 메서드 실행 전에 {@link DynamicPermissionClient} 를 통해 동적 권한을 검증한다.
 *
 * <p>X-User-Id / X-User-Role 헤더 추출 순서:
 * <ol>
 *   <li>메서드 파라미터 중 {@code @RequestHeader("X-User-*")} 어노테이션이 붙은 첫 번째 String 파라미터</li>
 *   <li>없으면 {@link RequestContextHolder} → {@link HttpServletRequest} 헤더에서 직접 추출</li>
 *   <li>account 모드에서 계정 UUID 가 없거나 파싱 실패하면 deny</li>
 * </ol>
 *
 * <p>deny 정책:
 * <ul>
 *   <li>MASTER: 동적 DB 조회 없이 통과</li>
 *   <li>PARTNER: 내부 서비스 접근 방어 차원에서 항상 deny.
 *       단, {@link RequirePermission#partnerSelfService()} 명시 opt-in endpoint 는 service 계층
 *       자기범위 검증을 전제로 통과</li>
 *   <li>account 모드: 그 외 {@link DynamicPermissionClient#check(UUID, String, PermissionAction)} == false → deny</li>
 *   <li>role 모드: VIEW 는 {@link DynamicPermissionClient#canView(String, String)},
 *       나머지 action 은 {@link DynamicPermissionClient#canEdit(String, String)} == false → deny</li>
 * </ul>
 *
 * <p>deny 시: {@link PermissionGuardMetrics#incrementDenied(String, String, String, String)} 호출
 * 후 {@link AccessDeniedException} throw.
 *
 * <p>{@link DynamicPermissionClient} 는 service 별로 다른 bean 이므로
 * {@link ObjectProvider} 를 통한 lazy 주입으로 bean 미존재 시 NoSuchBeanDefinitionException 회피.
 * account 모드에서 DynamicPermissionClient bean 이 없으면 권한 검증을 건너뛴다
 * (서비스 미지원 환경 호환). role 모드는 명시 opt-in 이므로 client 누락 시 deny 한다.
 *
 * <p>SP-D5 cycle 2 fix:
 * <ul>
 *   <li>P0-2: {@code service} tag 를 {@code spring.application.name} 으로 정합 (패키지 추론 폐기)</li>
 *   <li>P1-2: {@code @Component} 제거 — bean 은 {@link PermissionSecurityAutoConfiguration}
 *       의 {@code @Bean} 으로 일원화 (consumer service component scan 우회 차단)</li>
 *   <li>P2-2: 도달 불가 {@code annotation.action() == null} 죽은 체크 제거</li>
 * </ul>
 *
 * @see RequirePermission
 * @see PermissionGuardMetrics
 * @since SP-D5
 */
@Aspect
public class PermissionAspect {

    private static final Logger log = LoggerFactory.getLogger(PermissionAspect.class);

    /** X-User-Role 헤더 이름 — api-gateway 전파 표준. */
    private static final String ROLE_HEADER = "X-User-Role";
    /** X-User-Id 헤더 이름 — JWT sub claim(계정 UUID) 전파 표준. */
    private static final String ACCOUNT_ID_HEADER = "X-User-Id";
    /**
     * X-Is-System-Master 헤더 이름 — Phase C4 신규.
     * api-gateway 가 JWT {@code isSystemMaster} claim 에서 추출하여 전파.
     * "true" 이면 role==MASTER OR 폴백 없이도 bypass.
     */
    private static final String IS_SYSTEM_MASTER_HEADER = "X-Is-System-Master";

    private final ObjectProvider<DynamicPermissionClient> clientProvider;
    private final PermissionGuardMetrics metrics;
    private final String serviceName;
    private final boolean roleBasedEnforcement;

    /**
     * 생성자 주입.
     *
     * @param clientProvider DynamicPermissionClient lazy provider (service 별 bean)
     * @param metrics        deny 횟수 카운터 컴포넌트
     * @param serviceName    {@code spring.application.name} 값 (Counter tag {@code service} 에 사용).
     *                       blank 시 {@code "unknown"} 으로 정규화.
     */
    public PermissionAspect(
            ObjectProvider<DynamicPermissionClient> clientProvider,
            PermissionGuardMetrics metrics,
            String serviceName) {
        this(clientProvider, metrics, serviceName, false);
    }

    /**
     * 생성자 주입.
     *
     * @param clientProvider       DynamicPermissionClient lazy provider (service 별 bean)
     * @param metrics              deny 횟수 카운터 컴포넌트
     * @param serviceName          {@code spring.application.name} 값 (Counter tag {@code service} 에 사용).
     *                             blank 시 {@code "unknown"} 으로 정규화.
     * @param roleBasedEnforcement true 이면 계정 UUID 대신 기존 role_page_permissions 기반
     *                             canView/canEdit 를 사용한다. 기본값은 false 이며,
     *                             아로로지스 독립 auth descope 전용 opt-in 이다.
     */
    public PermissionAspect(
            ObjectProvider<DynamicPermissionClient> clientProvider,
            PermissionGuardMetrics metrics,
            String serviceName,
            boolean roleBasedEnforcement) {
        this.clientProvider = clientProvider;
        this.metrics = metrics;
        this.serviceName = (serviceName == null || serviceName.isBlank()) ? "unknown" : serviceName;
        this.roleBasedEnforcement = roleBasedEnforcement;
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

        String page = annotation.page();
        PermissionAction action = annotation.action();
        String actionName = action.name();

        String roleCode = normalizeHeader(extractHeader(joinPoint, signature, ROLE_HEADER), "UNKNOWN");
        String isSystemMasterHeader = extractHeader(joinPoint, signature, IS_SYSTEM_MASTER_HEADER);
        if (isMasterBypass(roleCode, isSystemMasterHeader)) {
            return joinPoint.proceed();
        }

        if ("PARTNER".equalsIgnoreCase(roleCode)) {
            if (annotation.partnerSelfService()) {
                return joinPoint.proceed();
            }
            deny(page, roleCode, actionName, "PARTNER role");
        }

        if (roleBasedEnforcement) {
            checkRolePermission(page, roleCode, action);
            return joinPoint.proceed();
        }

        UUID accountId = parseAccountId(extractHeader(joinPoint, signature, ACCOUNT_ID_HEADER));
        if (accountId == null) {
            deny(page, roleCode, actionName, "accountId missing or invalid");
        }

        DynamicPermissionClient client = clientProvider.getIfAvailable();
        if (client == null) {
            log.debug("[SP-PO-1] DynamicPermissionClient bean 없음 — 권한 검증 건너뜀 (page={} action={})",
                    page, actionName);
            return joinPoint.proceed();
        }

        if (!client.check(accountId, page, action)) {
            deny(page, roleCode, actionName, "account permission missing");
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
    private String extractHeader(ProceedingJoinPoint joinPoint, MethodSignature signature, String targetHeader) {
        Parameter[] parameters = signature.getMethod().getParameters();
        Object[]    args       = joinPoint.getArgs();

        // 1) @RequestHeader 파라미터에서 추출
        for (int i = 0; i < parameters.length; i++) {
            RequestHeader rh = parameters[i].getAnnotation(RequestHeader.class);
            if (rh != null) {
                String headerName = rh.value().isBlank() ? rh.name() : rh.value();
                if (targetHeader.equalsIgnoreCase(headerName) && args[i] instanceof String) {
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
                return request.getHeader(targetHeader);
            }
        } catch (Exception e) {
            log.debug("[SP-PO-1] HttpServletRequest 에서 {} 추출 실패: {}", targetHeader, e.getMessage());
        }

        return null;
    }

    private UUID parseAccountId(String rawAccountId) {
        if (rawAccountId == null || rawAccountId.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(rawAccountId);
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private String normalizeHeader(String raw, String fallback) {
        return raw == null || raw.isBlank() ? fallback : raw.trim();
    }

    private void checkRolePermission(String page, String roleCode, PermissionAction action) {
        DynamicPermissionClient client = clientProvider.getIfAvailable();
        if (client == null) {
            deny(page, roleCode, action.name(), "role permission client missing");
        }

        boolean allowed = action == PermissionAction.VIEW
                ? client.canView(roleCode, page)
                : client.canEdit(roleCode, page);
        if (!allowed) {
            deny(page, roleCode, action.name(), "role permission missing");
        }
    }

    /**
     * MASTER bypass 판정 — Phase C4 OR 폴백 설계.
     *
     * <p>판정 순서:
     * <ol>
     *   <li>{@code X-Is-System-Master == "true"} → bypass (Phase C4 신규 경로).</li>
     *   <li>{@code role == "MASTER"} → bypass (기존 폴백, 락아웃 0 보장 — 제거 금지).</li>
     *   <li>{@code roleBasedEnforcement} 모드에서 {@code role == "AROLOGIS_MASTER"} → bypass.</li>
     * </ol>
     *
     * <p>헤더 파이프(JWT → 게이트웨이 → 서비스)가 깨져도 role 폴백이 MASTER 접근을 보존한다.
     * role 폴백 제거는 C4-3(검증 후) 예정.
     *
     * @param roleCode            X-User-Role 헤더 값 (null-safe, normalized)
     * @param isSystemMasterHeader X-Is-System-Master 헤더 값 (null 허용)
     * @return bypass 허용 여부
     */
    private boolean isMasterBypass(String roleCode, String isSystemMasterHeader) {
        // Phase C4 신규 경로: X-Is-System-Master == "true"
        if ("true".equalsIgnoreCase(isSystemMasterHeader)) {
            return true;
        }
        // 기존 role 폴백 — 락아웃 0 보장 (제거 금지, C4-3 이후 단계에서 검토)
        if ("MASTER".equalsIgnoreCase(roleCode)) {
            return true;
        }
        return roleBasedEnforcement && "AROLOGIS_MASTER".equalsIgnoreCase(roleCode);
    }

    private void deny(String page, String roleCode, String action, String reason) {
        log.debug("[SP-PO-1] 권한 deny — service={} page={} role={} action={} reason={}",
                serviceName, page, roleCode, action, reason);
        metrics.incrementDenied(serviceName, page, roleCode, action);
        throw new AccessDeniedException(
                String.format("[SP-PO-1] 동적 권한 deny — page=%s action=%s role=%s reason=%s",
                        page, action, roleCode, reason));
    }
}
