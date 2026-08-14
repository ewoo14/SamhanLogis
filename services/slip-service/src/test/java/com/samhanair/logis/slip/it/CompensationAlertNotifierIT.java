package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;

import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.ArologisDispatchClient;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.NotificationChatRoomClient;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.client.PartnerBlockClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.delivery.sms.SmsGateway;
import com.samhanair.logis.slip.domain.CompensationOperation;
import com.samhanair.logis.slip.domain.CompensationPhase;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.service.CompensationAuditWriter;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.util.ReflectionTestUtils;
// (no extra extensions — AbstractPostgresIT 가 Testcontainers 컨텍스트를 제공)

/**
 * 보상 실패 운영 알림 통합 테스트 — 실 Spring 컨텍스트에서 알림 활성 설정의 seam 발화를 검증한다.
 *
 * <p>{@code samhan.compensation.alert.enabled=true} + recipient 지정 시, 감사 행 저장 성공 후
 * {@link NotificationClient#sendUserPush} 가 호출되는지 확인한다. 실 PostgreSQL/Flyway 스키마에서
 * 감사 행 저장(REQUIRES_NEW)과 알림 seam 의 결합을 검증한다. (D-SER-26)
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@TestPropertySource(properties = {
        "samhan.compensation.alert.enabled=true",
        "samhan.compensation.alert.recipient-user-id=11111111-1111-1111-1111-111111111111"
})
class CompensationAlertNotifierIT extends AbstractPostgresIT {

    private static final String SLIP_NO = "2026/06/03-COMP-ALERT-001";
    private static final UUID RECIPIENT = UUID.fromString("11111111-1111-1111-1111-111111111111");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private CompensationAuditWriter auditWriter;

    @MockBean
    private NotificationClient notificationClient;

    @MockBean
    private ArologisDispatchClient arologisDispatchClient;

    @MockBean
    private InventoryClient inventoryClient;

    @MockBean
    private NotificationChatRoomClient notificationChatRoomClient;

    @MockBean
    private PartnerBlockClient partnerBlockClient;

    @MockBean
    private PartnerInternalClient partnerInternalClient;

    @MockBean
    private ProductClient productClient;

    @MockBean
    private SmsGateway smsGateway;

    @MockBean
    private UserInternalClient userInternalClient;

    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    @AfterEach
    void tearDown() {
        jdbcTemplate.update("DELETE FROM serial_compensation_failures WHERE slip_no = ?", SLIP_NO);
    }

    @Test
    void record_whenAlertEnabled_sendsPushAfterAuditSave() {
        Slip slip = Slip.createOutbound(SLIP_NO, LocalDate.of(2026, 6, 3), 1,
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                "삼한상사", DeliveryTag.SALE, null, "alert-it");
        ReflectionTestUtils.setField(slip, "id", UUID.randomUUID());

        // 보상 예외 메시지에 내부 UUID 가 섞여 있어도(현실적 시나리오) 푸시 본문에는 노출되지 않아야 한다.
        String leakedUuid = UUID.randomUUID().toString();
        auditWriter.record(slip, CompensationPhase.ACCEPT_RESERVE, "AC-ALERT-IT-001",
                CompensationOperation.RELEASE_INSTANCES,
                new RuntimeException("release 실패 instance=" + leakedUuid),
                new RuntimeException("reserve 실패 warehouse=" + leakedUuid));

        // 감사 행 저장(REQUIRES_NEW) 커밋 후 운영 알림 push 가 비즈니스 식별자 제목/본문으로 발송된다.
        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        verify(notificationClient).sendUserPush(eq(RECIPIENT),
                eq("[보상실패] " + SLIP_NO), body.capture());
        assertThat(body.getValue())
                .contains(SLIP_NO)
                .contains("AC-ALERT-IT-001")
                .contains("RELEASE_INSTANCES");
        // 🚨 UUID 비공개 — 예외 메시지에 들어온 UUID 가 푸시 본문에 유출되지 않는다. (Codex cross-check P1)
        assertThat(body.getValue()).doesNotContain(leakedUuid);
    }
}
