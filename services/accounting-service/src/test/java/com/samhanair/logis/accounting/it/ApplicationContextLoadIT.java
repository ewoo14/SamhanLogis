package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.audit.service.AccountingAuditLogService;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.ChatRoomMappingClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.ProductClient;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.accounting.editrequest.service.AccountingEditRequestService;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import com.samhanair.logis.shared.realtime.lock.EditLockGuard;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.ApplicationContext;

/**
 * ApplicationContext load 만 검증하는 경량 IT — bean 등록 충돌 / dependency injection 누락 즉시 탐지.
 *
 * <p><b>장기 가드 (PR #119 commit 4c98ed2 패턴 일관, PR-G1 backlog #3).</b> accounting-service 의
 * Configuration class 들 (PR-E2 BE 신규 외부 client 3 + POI export) 의 {@code @Bean} 메서드 이름
 * 충돌 패턴을 사전에 차단. 본 IT 가 즉시 fail (BeanDefinitionOverrideException) 회귀 가드.
 *
 * <p>외부 client {@code @MockBean} 격리 ({@code feedback_it_mockbean_external_clients}) — Eureka
 * 비활성 환경 5xx 회피.
 *
 * <p>Docker 미가용 환경에서는 {@link AbstractPostgresIT} 의 {@code DockerAvailableCondition} 으로
 * 자동 skip — CI Linux runner 에서만 실 검증.
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
class ApplicationContextLoadIT extends AbstractPostgresIT {

    @Autowired
    private ApplicationContext applicationContext;

    @Autowired
    private RealtimeBroker realtimeBroker;
    @Autowired
    private EditLockGuard editLockGuard;
    @Autowired
    private AccountingAuditLogService accountingAuditLogService;
    @Autowired
    private AccountingEditRequestService accountingEditRequestService;

    @MockBean
    private SlipServiceClient slipServiceClient;
    @MockBean
    private ProductClient productClient;
    @MockBean
    private PartnerLookupClient partnerLookupClient;
    @MockBean
    private ChatRoomMappingClient chatRoomMappingClient;
    /** SP-09-1 e-Tax client 격리 — Phase 11 NTS 전환 시 IT 실 API 호출 방지 (D2). */
    @MockBean
    private ETaxClient eTaxClient;
    /** SP-09-4 KFTC 오픈뱅킹 client 격리 — Phase 11 sandbox 전환 시 IT 실 API 호출 방지. */
    @MockBean
    private KftcClient kftcClient;
    /** SP-D2 동적 권한 client 격리 — auth-service 호출 차단 (기본값 false = fallback 통과). */
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class)
    private DynamicPermissionClient dynamicPermissionClient;

    /**
     * Spring ApplicationContext 가 BeanDefinitionOverrideException / NoSuchBeanDefinitionException
     * 없이 정상 부팅하는지만 검증.
     */
    @Test
    void contextLoads() {
        assertThat(applicationContext).isNotNull();
    }

    /**
     * PR-H4b BE-A — shared:realtime-abstraction 의 RealtimeBroker / EditLockGuard 가 자동 설정으로
     * 등록되었고, accounting-service 의 audit / edit-request bean 도 정상 주입되는지 확인.
     */
    @Test
    void realtimeBeansAreWired() {
        assertThat(realtimeBroker).isNotNull();
        assertThat(editLockGuard).isNotNull();
        assertThat(accountingAuditLogService).isNotNull();
        assertThat(accountingEditRequestService).isNotNull();
    }
}
