package com.samhanair.logis.dcconfig.config;

import jakarta.annotation.PostConstruct;
import java.util.Arrays;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * 부팅 시 {@code app.security.internal.token} 값이 dev 기본값인 채로 prod 프로파일에서
 * 가동되는 사고를 차단한다. 비프로덕션 환경에서는 경고만 로깅.
 *
 * <p>DC 노출 5겹 가드 의 5번째 — internal token. 시크릿이 dev 기본값 그대로
 * 프로덕션에 떠 버리면 5겹 가드가 1겹으로 무너지므로 부팅 단계에서 차단.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class InternalTokenGuard {

    static final String DEV_DEFAULT = "dev-only-token-replace";
    private static final String PROD_PROFILE = "prod";

    private final InternalAuthProperties props;
    private final Environment environment;

    /**
     * Spring 컨텍스트 초기화 시점에 1회 검증 — prod 프로파일에서 dev 기본 토큰이면 부팅 거부,
     * 비프로덕션에서 dev 기본값이면 경고만 로깅.
     *
     * @throws IllegalStateException prod 프로파일 + dev 기본 토큰 조합 (Spring 부팅 실패)
     */
    @PostConstruct
    void verify() {
        boolean isProd = Arrays.stream(environment.getActiveProfiles())
                .anyMatch(p -> p.equalsIgnoreCase(PROD_PROFILE));
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
