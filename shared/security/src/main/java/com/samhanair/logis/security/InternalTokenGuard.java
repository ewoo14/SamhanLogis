package com.samhanair.logis.security;

import jakarta.annotation.PostConstruct;
import java.util.Arrays;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.env.Environment;

/**
 * X-Internal-Token dev 기본값 prod 부팅 차단 가드 — Phase 10 W10-4 (PR #99) DV-3 채택으로
 * 13 service 통합 module 추출.
 *
 * <p>부팅 시 {@code app.security.internal.token} 값이 dev 기본값 ({@value #DEV_DEFAULT}) 인 채로 prod
 * 프로파일에서 가동되는 사고를 차단한다. 비프로덕션 환경에서는 경고만 로깅.
 *
 * <p>{@link InternalSecurityAutoConfiguration} 가 bean 으로 등록.
 */
@Slf4j
@RequiredArgsConstructor
public class InternalTokenGuard {

    /** dev 환경 기본 토큰 값 — env-templates / application.yml default 와 1:1 일치. */
    public static final String DEV_DEFAULT = "CHANGE_ME_LOCAL_ONLY";

    /** 운영 프로파일 별칭. 배포 환경은 production 을 사용하므로 prod 단일 검사로는 부족하다. */
    private static final Set<String> PROD_PROFILES = Set.of("prod", "production");

    private final InternalAuthProperties props;
    private final Environment environment;

    /**
     * Spring 컨텍스트 초기화 시점에 1회 검증 — prod 프로파일에서 dev 기본 토큰이면 부팅 거부,
     * 비프로덕션에서 dev 기본값이면 경고만 로깅.
     *
     * @throws IllegalStateException prod 프로파일 + dev 기본 토큰 조합 (Spring 부팅 실패)
     */
    @PostConstruct
    public void verify() {
        boolean isProd = Arrays.stream(environment.getActiveProfiles())
                .map(String::toLowerCase)
                .anyMatch(PROD_PROFILES::contains);
        boolean isDevDefault = DEV_DEFAULT.equals(props.getToken());

        if (isProd && isDevDefault) {
            throw new IllegalStateException(
                    "INTERNAL_AUTH_TOKEN(=app.security.internal.token) 가 dev 기본값('"
                            + DEV_DEFAULT
                            + "') 인 채로 prod 프로파일이 활성화되었습니다. "
                            + "환경변수 INTERNAL_AUTH_TOKEN 을 안전한 값으로 설정 후 재기동하세요.");
        }
        if (isDevDefault) {
            log.warn("[보안] app.security.internal.token 가 dev 기본값입니다. "
                    + "비프로덕션이면 무시. 배포 전 INTERNAL_AUTH_TOKEN 환경변수로 교체 필요.");
        }
    }
}
