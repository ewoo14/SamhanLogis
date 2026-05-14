package com.samhanair.logis.arologis.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.arologis.ArologisServiceApplication;
import com.samhanair.logis.arologis.client.NotificationClient;
import com.samhanair.logis.arologis.client.PartnerClient;
import com.samhanair.logis.arologis.client.SlipClient;
import com.samhanair.logis.arologis.client.SlipServiceClient;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.ApplicationContext;

/**
 * ApplicationContext load 만 검증하는 경량 IT — bean 등록 충돌 / dependency injection 누락 즉시 탐지.
 *
 * <p><b>장기 가드 (PR #119 commit 4c98ed2 패턴 일관, PR-G1 backlog #3).</b> arologis-service 의
 * Configuration class 들 (RegionClassifier / VendorExcelParser / 신규 client) 의 {@code @Bean}
 * 메서드 이름이 클래스 빈 이름과 충돌하는 패턴을 사전에 차단. 본 IT 가 즉시 fail
 * (BeanDefinitionOverrideException) 회귀 가드.
 *
 * <p>외부 client {@code @MockBean} 격리 ({@code feedback_it_mockbean_external_clients}) — Eureka
 * 비활성 환경 5xx 회피.
 *
 * <p>Docker 미가용 환경 (Windows 한글 path) 에서는 {@link AbstractPostgresIT} 의
 * {@code DockerAvailableCondition} 으로 자동 skip — CI Linux runner 에서만 실 검증.
 */
@SpringBootTest(classes = ArologisServiceApplication.class)
class ApplicationContextLoadIT extends AbstractPostgresIT {

    @Autowired
    private ApplicationContext applicationContext;

    @MockBean
    private PartnerClient partnerClient;
    // 2026-05-14 분리 — UserClient @MockBean 제거 (자체 user 도메인 도입).
    @MockBean
    private SlipClient slipClient;
    @MockBean
    private NotificationClient notificationClient;
    @MockBean
    private SlipServiceClient slipServiceClient;

    /**
     * Spring ApplicationContext 가 BeanDefinitionOverrideException / NoSuchBeanDefinitionException
     * 없이 정상 부팅하는지만 검증.
     */
    @Test
    void contextLoads() {
        assertThat(applicationContext).isNotNull();
    }
}
