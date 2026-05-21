package com.samhanair.logis.accounting.report;

import com.samhanair.logis.security.permission.DynamicPermissionClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * SP-D2 재무 보고서 동적 권한 가드 (공유 컴포넌트).
 *
 * <p>report 패키지의 10개 controller 가 공유하는 동적 RBAC VIEW 검증 컴포넌트.
 * {@link DynamicPermissionClient} 를 통해 auth-service 의 override row 를 확인한다.
 *
 * <p>페이지 코드: {@code accounting.reports}
 *
 * <p>점진 마이그레이션 정책:
 * override row 없음(canView=false fallback) 시 기존 {@code @PreAuthorize} 통과로 충분.
 * 이 가드는 VIEW 권한 로그 및 향후 명시적 deny 확장에 대비한 추가 레이어이다.
 *
 * <p>IT 에서 {@code @MockBean} 격리 필요 (메모리 가드 {@code feedback_it_mockbean_external_clients.md}).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ReportPermissionGuard {

    /** SP-D2 — 재무 보고서 페이지 코드. */
    public static final String PAGE_CODE = "accounting.reports";

    private final DynamicPermissionClient dynamicPermissionClient;

    /**
     * SP-D2 동적 VIEW 권한 검증.
     *
     * <p>actorRole null/blank 이면 건너뜀.
     * canView=false: fallback(row 없음) 또는 명시적 deny 구분 불가
     * → 점진 마이그레이션 정책으로 통과 (기존 @PreAuthorize 가 이미 검증).
     * 향후 명시적 deny 를 403 으로 처리하려면 이 메서드를 수정한다.
     *
     * @param actorRole 요청자 role (X-User-Role 헤더)
     */
    public void checkView(String actorRole) {
        if (actorRole == null || actorRole.isBlank()) {
            return;
        }
        boolean canView = dynamicPermissionClient.canView(actorRole, PAGE_CODE);
        if (!canView) {
            log.debug("[SP-D2] 재무 보고서 VIEW 동적 권한 false (fallback 또는 deny) — roleCode={} pageCode={}",
                    actorRole, PAGE_CODE);
        }
    }
}
