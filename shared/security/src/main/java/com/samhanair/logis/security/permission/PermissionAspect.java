package com.samhanair.logis.security.permission;

import jakarta.servlet.http.HttpServletRequest;
import java.lang.reflect.Parameter;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
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
 * <p>X-User-Id / X-User-Role / X-User-Groups 헤더 추출 순서:
 * <ol>
 *   <li>메서드 파라미터 중 {@code @RequestHeader("X-User-*")} 어노테이션이 붙은 첫 번째 String 파라미터</li>
 *   <li>없으면 {@link RequestContextHolder} → {@link HttpServletRequest} 헤더에서 직접 추출</li>
 *   <li>account 모드에서 계정 UUID 가 없거나 파싱 실패하면 deny</li>
 * </ol>
 *
 * <p>deny 정책:
 * <ul>
 *   <li>MASTER: 동적 DB 조회 없이 통과 (X-Is-System-Master=true OR role=MASTER)</li>
 *   <li>PARTNER 판정: api-gateway 가 JWT role 클레임을 검증하여 {@code X-User-Role: PARTNER} 로 전파하는
 *       경로만 신뢰 가능하다.
 *       <br>[실측 결론 C5-3] partner-auth-service 는 {@code JwtTokenProvider.generate(id, "PARTNER", ...)} 로
 *       발급하며 JWT 에 partnerCode 클레임이 없다. 게이트웨이도 {@code X-Partner-Code} 를 자체 주입하지 않는다.
 *       FE/모바일이 전송하는 {@code X-Partner-Code} 는 FE origin 이므로 PermissionAspect 에서 신뢰 판정
 *       근거로 쓸 수 없다.
 *       따라서 PARTNER 거절 판정은 기존 {@code role == "PARTNER"} 로 유지한다.
 *       partnerSelfService opt-in endpoint 는 service 계층 자기범위 검증을 전제로 통과시킨다.</li>
 *   <li>account 모드: 그 외 {@link DynamicPermissionClient#check(UUID, String, PermissionAction)} == false → deny</li>
 *   <li>role 모드: VIEW 는 {@link DynamicPermissionClient#canView(String, String)},
 *       나머지 action 은 {@link DynamicPermissionClient#canEdit(String, String)} == false → deny</li>
 * </ul>
 *
 * <p>Phase C5-3 추가 — {@link #parseGroupsHeader(String)} 공유 파서:
 * {@code X-User-Groups} 헤더 raw 값을 comma-split 하여 {@code Set<String>} 으로 파싱한다.
 * Aspect 판정 경로의 그룹 소비는 PR-2(C5-4, X-User-Role 제거)에서 도입 —
 * 현재 소비처는 서비스 계층 guard(SlipSalesAccessGuard 등)가 본 파서를 호출하는 형태다.
 *
 * <p>deny 시: {@link PermissionGuardMetrics#incrementDenied(String, String, String, String)} 호출
 * 후 {@link AccessDeniedException} throw.
 *
 * <p>{@link DynamicPermissionClient} 는 service 별로 다른 bean 이므로
 * {@link ObjectProvider} 를 통한 lazy 주입으로 bean 미존재 시 NoSuchBeanDefinitionException 회피.
 * [실QA fail-secure] account 모드에서 DynamicPermissionClient bean 이 없으면 **fail-secure 로 deny**
 * 한다(설정 누락 시 전 @RequirePermission 무검증 통과 방지). role 모드도 동일하게 client 누락 시 deny.
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
            // [실QA fail-secure] bean 미구성 시 검증 skip(fail-open) 하면 해당 서비스 전 @RequirePermission
            // 무검증 통과 → fail-secure 로 deny (checkRolePermission 동일 분기와 일관, 정상 배포는 bean 존재로 영향 0).
            log.error("[SP-PO-1] DynamicPermissionClient bean 없음 — fail-secure deny (page={} action={})",
                    page, actionName);
            deny(page, roleCode, actionName, "permission client missing");
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

    /**
     * comma-join 그룹 헤더({@code X-User-Groups}) 문자열을 {@link Set} 으로 파싱한다 — Phase C5-3 신규.
     *
     * <p>null 또는 blank 이면 빈 Set 반환. 각 항목 trim 및 빈 항목 제거.
     * Set 은 O(1) 교집합 체크용. 공유 단일 구현 — 서비스 계층 guard(SlipSalesAccessGuard 등)도
     * 본 메서드를 사용한다(중복 구현 금지, PR #414 dual review P2).
     *
     * <p>현재 Aspect 판정 경로는 본 메서드를 소비하지 않는다 — PR-2(C5-4)에서
     * X-User-Role 제거와 함께 그룹 집합 기반 판정으로 소비 예정.
     * [실측 C5-3] partner-auth JWT 에 partnerCode 클레임 부재 → PARTNER 식별 전환도 PR-2 선행 additive 후 수행.
     *
     * @param raw X-User-Groups 헤더 raw 값 (null 허용)
     * @return 그룹 UUID 문자열 집합 (null 미반환)
     */
    public static Set<String> parseGroupsHeader(String raw) {
        if (raw == null || raw.isBlank()) {
            return Collections.emptySet();
        }
        Set<String> result = new HashSet<>();
        for (String part : raw.split(",")) {
            String trimmed = part.trim();
            if (!trimmed.isEmpty()) {
                result.add(trimmed);
            }
        }
        return Collections.unmodifiableSet(result);
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
