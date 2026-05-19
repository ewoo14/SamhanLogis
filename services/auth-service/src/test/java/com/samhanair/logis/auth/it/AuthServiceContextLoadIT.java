package com.samhanair.logis.auth.it;

import com.samhanair.logis.auth.AuthServiceApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

/**
 * auth-service Spring 컨텍스트 로드 통합 테스트 (audit-slice-3 P1-2).
 *
 * <p>외부 의존(PostgreSQL, Eureka, SMTP) 없이 H2 in-memory + local 프로필로
 * ApplicationContext 가 정상 기동하는지 검증한다.
 *
 * <p>H2 in-memory 데이터소스는 {@code application.yml}의 {@code local} 프로필
 * 설정을 재활용한다 (ddl-auto=create-drop, flyway.enabled=false).
 *
 * <p>외부 client 격리:
 * auth-service 는 외부 RestClient 를 직접 보유하지 않으므로 {@code @MockBean} 추가 없이
 * Spring Context 로드 만으로 컴파일+기동 검증이 가능하다.
 * Eureka 등록 비활성은 {@code TestPropertySource} 로 보장.
 */
@SpringBootTest(
        classes = AuthServiceApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.NONE
)
@TestPropertySource(properties = {
        "spring.profiles.active=local",
        "eureka.client.enabled=false",
        "eureka.client.register-with-eureka=false",
        "eureka.client.fetch-registry=false",
        "app.security.jwt.secret=test-secret-key-32-chars-min-aaaaaa",
        "app.security.internal.token=test-internal-token"
})
class AuthServiceContextLoadIT {

    /**
     * ApplicationContext 가 예외 없이 기동되면 PASS.
     *
     * <p>Context 로드 자체가 실패하면 @SpringBootTest 가 테스트 초기화 오류로 FAIL 처리.
     */
    @Test
    @DisplayName("auth-service Spring 컨텍스트 정상 로드 — H2 in-memory + Eureka 비활성")
    void contextLoads() {
        // ApplicationContext 가 기동되면 테스트 PASS.
        // 추가 검증 불필요 — 컨텍스트 로드 자체가 목적.
    }
}
