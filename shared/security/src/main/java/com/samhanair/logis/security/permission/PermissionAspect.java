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
 * <p>X-User-Id / X-User-Groups / X-Is-System-Master / X-Is-Partner 헤더 추출 순서:
 * <ol>
 *   <li>메서드 파라미터 중 {@code @RequestHeader("X-User-*")} 어노테이션이 붙은 첫 번째 String 파라미터</li>
 *   <li>없으면 {@link RequestContextHolder} → {@link HttpServletRequest} 헤더에서 직접 추출</li>
 *   <li>account 모드에서 계정 UUID 가 없거나 파싱 실패하면 deny</li>
 * </ol>
 *
 * <p>deny 정책:
 * <ul>
 *   <li>MASTER bypass: {@code X-Is-System-Master=true} → bypass (Phase C4).
 *       Phase C5-4 (C4-3): {@code role==MASTER} 폴백 제거. X-Is-System-Master 단독 판정.
 *       arologis roleBasedEnforcement 모드에서 {@code AROLOGIS_MASTER} role bypass 는 유지.</li>
 *   <li>PARTNER 거절: {@code X-Is-Partner=true} 헤더 존재 시 deny (Phase C5-4).
 *       api-gateway 가 JWT {@code partnerCode} claim 존재 시 주입. FE origin 헤더는 게이트웨이가 덮어씀.
 *       [실측 결론 C5-3] partner-auth JWT 에 partnerCode 클레임 추가 후 전환. role 폴백 제거.
 *       partnerSelfService opt-in endpoint 는 service 계층 자기범위 검증을 전제로 통과.</li>
 *   <li>account 모드: 그 외 {@link DynamicPermissionClient#check(UUID, String, PermissionAction)} == false → deny</li>
 *   <li>role 모드의 아로로지스 독립 JWT: 자체 JWT filter가 주입한 {@code X-User-Role}이 있는
 *       경우 VIEW 는 {@link DynamicPermissionClient#canView(String, String)}, 나머지 action 은
 *       {@link DynamicPermissionClient#canEdit(String, String)} == false → deny</li>
 *   <li>role 모드의 Samhan 게이트웨이 직원 요청: role 헤더가 없으면 account UUID 기반
 *       {@link DynamicPermissionClient#check(UUID, String, PermissionAction)} 경로로 판정</li>
 * </ul>
 *
 * <p>Phase C5-3 추가 — {@link #parseGroupsHeader(String)} 공유 파서:
 * {@code X-User-Groups} 헤더 raw 값을 comma-split 하여 {@code Set<String>} 으로 파싱한다.
 * 소비처는 서비스 계층 guard(SlipSalesAccessGuard 등)와 본 Aspect checkPermission 경로.
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

    /**
     * X-User-Role 헤더 이름 — arologis roleBasedEnforcement 모드 전용.
     *
     * <p>Phase C5-4: Samhan Public 인가 경로에서 X-User-Role 이 제거되었다.
     * 이 상수는 arologis 독립 운영 단위({@code roleBasedEnforcement=true}) 전용으로만 사용되며,
     * 일반 Samhan 서비스에서는 역할 헤더가 전송되지 않으므로 null 수신 — 판정에 영향 없음.
     */
    private static final String ROLE_HEADER = "X-User-Role";
    /** X-User-Id 헤더 이름 — JWT sub claim(계정 UUID) 전파 표준. */
    private static final String ACCOUNT_ID_HEADER = "X-User-Id";
    /**
     * X-Is-System-Master 헤더 이름 — Phase C4 신규.
     * api-gateway 가 JWT {@code isSystemMaster} claim 에서 추출하여 전파.
     * Phase C5-4 (C4-3): role 폴백 제거 후 이 헤더 단독 bypass 판정.
     */
    private static final String IS_SYSTEM_MASTER_HEADER = "X-Is-System-Master";
    /**
     * X-Is-Partner 헤더 이름 — Phase C5-4 신규.
     * api-gateway 가 JWT {@code partnerCode} claim 존재 시 {@code "true"} 로 주입.
     * PermissionAspect PARTNER 거절 판정에 사용된다.
     * role 폴백({@code role=="PARTNER"}) 대체.
     */
    private static final String IS_PARTNER_HEADER = "X-Is-Partner";
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
     * @param roleBasedEnforcement true 이면 아로로지스 role 헤더가 있는 독립 로그인은 기존
     *                             role_page_permissions 기반 canView/canEdit를 사용하고,
     *                             role 헤더가 없는 게이트웨이 직원 요청은 account 권한을 사용한다.
     *                             기본값은 false 이며, 아로로지스 독립 auth descope 전용 opt-in 이다.
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

        String rawRoleHeader = extractHeader(joinPoint, signature, ROLE_HEADER);
        // Samhan 직원 JWT는 X-User-Role을 전파하지 않고 그룹 집합으로 권한을 판정한다.
        // 역할이 없는 정상 그룹 기반 요청을 role=UNKNOWN으로 기록하지 않는다.
        String roleCode = normalizeHeader(rawRoleHeader, "GROUP_BASED");
        String isSystemMasterHeader = extractHeader(joinPoint, signature, IS_SYSTEM_MASTER_HEADER);
        boolean hasIndependentRoleHeader = hasIndependentArologisRoleHeader(rawRoleHeader);
        if (isMasterBypass(roleCode, isSystemMasterHeader, hasIndependentRoleHeader)) {
            return joinPoint.proceed();
        }

        // Phase C5-4: PARTNER 거절 판정을 X-Is-Partner 헤더 기반으로 전환.
        // api-gateway 가 JWT partnerCode claim 존재 시 X-Is-Partner: true 를 주입한다.
        // role 폴백(role=="PARTNER")은 제거 — Samhan JWT 에 role 클레임 없어 의미 상실.
        // P1-b: X-Is-Partner=true 분기에서 메트릭/로그의 roleCode 를 "PARTNER" 고정.
        //       C5-4 이후 Samhan JWT 에 role 클레임이 없어 roleCode=UNKNOWN 으로 기록되던 문제 해소.
        String isPartnerHeader = extractHeader(joinPoint, signature, IS_PARTNER_HEADER);
        if ("true".equalsIgnoreCase(isPartnerHeader) && isPartnerIdentity(rawRoleHeader)) {
            if (annotation.partnerSelfService()) {
                return joinPoint.proceed();
            }
            // P1-b: PARTNER 거절 시 roleCode 를 "PARTNER" 로 고정 — 메트릭 레이블 UNKNOWN 방지
            deny(page, "PARTNER", actionName, "PARTNER identity (X-Is-Partner=true)");
        }

        if (roleBasedEnforcement && hasIndependentRoleHeader) {
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

    /**
     * PARTNER 헤더가 실제 PARTNER 신원을 나타내는지 판정한다.
     *
     * <p>게이트웨이는 JWT를 검증한 뒤 {@code X-User-Role}을 직원 요청에 전달하지 않는다.
     * 다만 레거시/격리 HTTP 배선에서 직원 역할이 함께 존재하면 그 역할을 우선해 클라이언트가
     * 덧붙인 {@code X-Is-Partner:true}가 직원 권한을 바꾸지 못하게 한다.
     */
    private boolean isPartnerIdentity(String rawRoleHeader) {
        return rawRoleHeader == null || rawRoleHeader.isBlank()
                || "PARTNER".equalsIgnoreCase(rawRoleHeader.trim());
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
     * <p>role 모드의 Samhan 게이트웨이 경로는 X-User-Role 없이 X-User-Groups를 전달받는다.
     * 실제 권한 판정은 account UUID를 auth-service에 전달하여 account/group effective 권한을
     * 조회하며, 이 파서는 HeaderAuthenticationFilter의 group authority 구성에 사용된다.
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
     * MASTER bypass 판정 — Phase C5-4 (C4-3): X-Is-System-Master 단독 판정.
     *
     * <p>판정 순서:
     * <ol>
     *   <li>{@code X-Is-System-Master == "true"} → bypass (Phase C4 경로).</li>
     *   <li>{@code roleBasedEnforcement} 모드에서 {@code role == "AROLOGIS_MASTER"} → bypass
     *       (아로로지스 독립 운영 단위 전용 — 자체 JWT 가 AROLOGIS_MASTER role 포함).</li>
     * </ol>
     *
     * <p>Phase C5-4 (C4-3): {@code role=="MASTER"} 폴백 제거.
     * Samhan JWT 에서 role 클레임이 소멸되었으므로 role 폴백은 의미 없고 오히려
     * 임의 role 문자열 주입으로 bypass 되는 위험 제거. X-Is-System-Master 헤더는
     * 게이트웨이가 JWT 서명 검증 후 claim 에서 주입하므로 신뢰 가능.
     *
     * @param roleCode                 X-User-Role 헤더 값 (null-safe, normalized) — arologis 전용
     * @param isSystemMasterHeader      X-Is-System-Master 헤더 값 (null 허용)
     * @param hasIndependentRoleHeader 자체 JWT filter가 주입한 role 헤더 존재 여부
     * @return bypass 허용 여부
     */
    private boolean isMasterBypass(
            String roleCode,
            String isSystemMasterHeader,
            boolean hasIndependentRoleHeader) {
        // Phase C4 경로: X-Is-System-Master == "true" (게이트웨이 JWT 클레임 기반, 신뢰)
        if ("true".equalsIgnoreCase(isSystemMasterHeader)) {
            return true;
        }
        // 아로로지스 독립 운영 단위 전용 — roleBasedEnforcement 모드에서 AROLOGIS_MASTER bypass
        return roleBasedEnforcement
                && hasIndependentRoleHeader
                && "AROLOGIS_MASTER".equalsIgnoreCase(roleCode);
    }

    /**
     * 아로로지스 자체 JWT 경로 여부를 role 헤더의 존재로 판정한다.
     *
     * <p>게이트웨이 경유 직원 요청은 C5-4에 따라 {@code X-User-Id}/{@code X-User-Groups}만
     * 주입하고 {@code X-User-Role}은 제거한다. 반면 {@code ArologisJwtFilter}는 자체 JWT
     * 검증 후 role claim을 {@code X-User-Role}로 주입한다. 이 분기는 arologis-service의
     * 독립 로그인 전용 role 소비와 게이트웨이 직원의 account 소비를 가르는 것이며,
     * 전역 게이트웨이 role 헤더를 복구하지 않는다.
     *
     * @param rawRoleHeader ArologisJwtFilter가 주입한 role 헤더 값
     * @return role 헤더가 있으면 true
     */
    private boolean hasIndependentArologisRoleHeader(String rawRoleHeader) {
        return roleBasedEnforcement && rawRoleHeader != null && !rawRoleHeader.isBlank();
    }

    private void deny(String page, String roleCode, String action, String reason) {
        log.debug("[SP-PO-1] 권한 deny — service={} page={} subject={} action={} reason={}",
                serviceName, page, roleCode, action, reason);
        metrics.incrementDenied(serviceName, page, roleCode, action);
        throw new AccessDeniedException(
                String.format("[SP-PO-1] 동적 권한 deny — page=%s action=%s subject=%s reason=%s",
                        page, action, roleCode, reason));
    }
}
