package com.samhanair.logis.notification.it;

import com.samhanair.logis.notification.NotificationServiceApplication;
import com.samhanair.logis.notification.client.AligoAddressBookClient;
import com.samhanair.logis.notification.client.AligoCsvSourceClient;
import com.samhanair.logis.notification.client.BlockedPartnerLookupClient;
import com.samhanair.logis.notification.client.PartnerLookupClient;
import com.samhanair.logis.notification.client.SlipServiceClient;
import com.samhanair.logis.notification.client.UserClient;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.ApplicationContext;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * ApplicationContext load 만 검증하는 경량 IT — bean 등록 충돌 / dependency injection 누락 즉시 탐지.
 *
 * <p><b>장기 가드 (PR #119 CI run 25615955037 회귀 fix 후속).</b> notification-service 의 Noop / Mock
 * {@link org.springframework.context.annotation.Configuration @Configuration} class 들 (Phase 10
 * PR-D / PR-F1 시점 추가) 의 {@code @Bean} 메서드 이름이 클래스 빈 이름과 충돌하는 패턴을 사전에
 * 차단한다. {@link com.samhanair.logis.notification.client.NoopPartnerLookupClient} /
 * {@link com.samhanair.logis.notification.client.NoopAligoCsvSourceClient} /
 * {@link com.samhanair.logis.notification.client.MockAligoAddressBookClient} 와 같이 메서드 이름이
 * 클래스 이름과 동일한 패턴을 추가하면 본 IT 가 즉시 fail (BeanDefinitionOverrideException).
 *
 * <p>본 IT 는 외부 client (PartnerLookupClient, UserClient) {@code @MockBean} 격리 + Postgres
 * Testcontainer 활성으로 SpringBoot full context 가 정상 부팅 가능한지만 검증한다 (개별 endpoint
 * 검증 X — 형제 IT (NotificationAdminControllerIT 등) 이 책임).
 *
 * <p>Docker 미가용 환경 (Windows 한글 path 환경 등) 에서는 {@link AbstractPostgresIT} 의
 * {@code DockerAvailableCondition} 으로 자동 skip — CI Linux runner 에서만 실 검증.
 */
@SpringBootTest(classes = NotificationServiceApplication.class)
class ApplicationContextLoadIT extends AbstractPostgresIT {

    @Autowired
    private ApplicationContext applicationContext;

    /** 외부 client 전체 격리 — Eureka 비활성 Testcontainers 환경에서 500 방지. */
    @MockBean private UserClient userClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private BlockedPartnerLookupClient blockedPartnerLookupClient;
    @MockBean private AligoCsvSourceClient aligoCsvSourceClient;
    @MockBean private AligoAddressBookClient aligoAddressBookClient;

    /**
     * Spring ApplicationContext 가 BeanDefinitionOverrideException / NoSuchBeanDefinitionException
     * 없이 정상 부팅하는지만 검증.
     */
    @Test
    void contextLoads() {
        assertThat(applicationContext).isNotNull();
        // notification-service 핵심 service bean 등록 확인 (dependency injection 누락 즉시 탐지)
        assertThat(applicationContext.getBeansOfType(
                com.samhanair.logis.notification.service.AligoAddressBookSyncService.class))
                .as("AligoAddressBookSyncService bean 등록 (CsvSourceClient + AddressBookClient inject 충족)")
                .isNotEmpty();
    }
}
