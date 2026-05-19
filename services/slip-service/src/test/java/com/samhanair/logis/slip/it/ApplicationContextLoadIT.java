package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;

import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.audit.service.SlipAuditLogService;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.NotificationChatRoomClient;
import com.samhanair.logis.slip.client.PartnerBlockClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ReceiptOcrClient;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.realtime.SlipRealtimeBroker;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.ApplicationContext;

/**
 * ApplicationContext load 만 검증하는 경량 IT — bean 등록 충돌 / dependency injection 누락 즉시 탐지.
 *
 * <p><b>장기 가드 (PR #119 commit 4c98ed2 패턴 일관, PR-G1 backlog #3).</b> slip-service 의
 * Configuration class 들 (PR-D BE-A 신규 GoogleSheetsClient + V16 컬럼 + PR-G1 SlipPublishProperties)
 * 의 {@code @Bean} 메서드 이름 충돌 패턴을 사전에 차단. 본 IT 가 즉시 fail
 * (BeanDefinitionOverrideException) 회귀 가드.
 *
 * <p>외부 client {@code @MockBean} 격리 ({@code feedback_it_mockbean_external_clients}) — Eureka
 * 비활성 환경 5xx 회피.
 *
 * <p>Docker 미가용 환경에서는 {@link AbstractPostgresIT} 의 {@code DockerAvailableCondition} 으로
 * 자동 skip — CI Linux runner 에서만 실 검증.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
class ApplicationContextLoadIT extends AbstractPostgresIT {

    @Autowired
    private ApplicationContext applicationContext;

    /** PR-H1 — SSE in-memory broker bean 단일 등록 회귀 가드 (Phase 12 Step 1). */
    @Autowired
    private SlipRealtimeBroker slipRealtimeBroker;

    /** PR-H2 — audit overlay service bean 단일 등록 회귀 가드 (Phase 12 Step 2). */
    @Autowired
    private SlipAuditLogService slipAuditLogService;

    @MockBean
    private ProductClient productClient;
    @MockBean
    private InventoryClient inventoryClient;
    @MockBean
    private NotificationChatRoomClient notificationChatRoomClient;
    @MockBean
    private PartnerBlockClient partnerBlockClient;
    @MockBean
    private PartnerInternalClient partnerInternalClient;
    /** SP-09-3 — ReceiptOcrClient (@MockBean 격리, feedback_it_mockbean_external_clients). */
    @MockBean
    private ReceiptOcrClient receiptOcrClient;
    /** SP-08-FU1 — UserInternalClient @MockBean 격리 (ownerFullName graceful fallback). */
    @MockBean
    private UserInternalClient userInternalClient;
    /** SP-08-FU2 P2-2 — WarehouseInternalClient @MockBean 격리 (destinationWarehouseName snapshot fail-soft). */
    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    /**
     * SP-08-FU1 cycle 2 fix — UserInternalClient lenient stub 적용으로 39 IT 패턴 일관.
     * contextLoads 검증만 수행하더라도 미래 회귀 (SlipService.resolveOwnerFullName 호출 추가) 가드.
     */
    @BeforeEach
    void setUpUserInternalClient() {
        lenient().when(userInternalClient.resolveFullName(any())).thenReturn(Optional.of("담당자"));
    }

    /**
     * Spring ApplicationContext 가 BeanDefinitionOverrideException / NoSuchBeanDefinitionException
     * 없이 정상 부팅하는지만 검증.
     */
    @Test
    void contextLoads() {
        assertThat(applicationContext).isNotNull();
    }

    /**
     * PR-H1 — SlipRealtimeBroker bean 단일 등록 + autowire 정합 회귀 가드.
     * @Component + @Scheduled (heartbeat) 가 EnableScheduling 활성 환경에서 정상 등록되는지 검증.
     */
    @Test
    void slipRealtimeBrokerBeanIsRegistered() {
        assertThat(slipRealtimeBroker).isNotNull();
        assertThat(applicationContext.getBeansOfType(SlipRealtimeBroker.class)).hasSize(1);
    }

    /**
     * PR-H2 — SlipAuditLogService bean 단일 등록 회귀 가드 (Phase 12 Step 2).
     * audit overlay service + repository + entity 등록 정합 검증.
     */
    @Test
    void slipAuditLogServiceBeanIsRegistered() {
        assertThat(slipAuditLogService).isNotNull();
        assertThat(applicationContext.getBeansOfType(SlipAuditLogService.class)).hasSize(1);
    }
}
