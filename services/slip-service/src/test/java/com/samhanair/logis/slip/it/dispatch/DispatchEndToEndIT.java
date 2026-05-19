package com.samhanair.logis.slip.it.dispatch;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.ArologisDispatchClient;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.NotificationChatRoomClient;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.client.PartnerBlockClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.delivery.sms.SmsGateway;
import com.samhanair.logis.slip.domain.dispatch.DispatchTask;
import com.samhanair.logis.slip.domain.dispatch.DispatchTaskStatus;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleType;
import com.samhanair.logis.slip.dto.dispatch.ArologisDispatchResponse;
import com.samhanair.logis.slip.dto.dispatch.DispatchTaskConfirmRequest;
import com.samhanair.logis.slip.dto.dispatch.DispatchTaskUnavailableRequest;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import com.samhanair.logis.slip.repository.dispatch.DispatchTaskRepository;
import com.samhanair.logis.slip.service.dispatch.DispatchTaskConfirmService;
import com.samhanair.logis.slip.service.dispatch.DispatchTaskService;
import com.samhanair.logis.slip.service.dispatch.DispatchTaskUnavailableService;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.security.test.context.support.WithMockUser;

/**
 * Mock 매칭 e2e — BE Task B14.
 *
 * <p>Samhan Public 측 dispatch task 생성 → 차량 그룹 → arologis 회신 confirm/unavailable
 * 전체 흐름을 service 레이어에서 단일 트랜잭션으로 검증 (controller layer 제외 — controller 는
 * 별도 IT 로 검증).
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@WithMockUser(username = "ewoo", authorities = {"ROLE_MASTER"})
class DispatchEndToEndIT extends AbstractPostgresIT {

    @Autowired DispatchTaskService taskService;
    @Autowired DispatchTaskConfirmService confirmService;
    @Autowired DispatchTaskUnavailableService unavailableService;
    @Autowired DispatchTaskRepository taskRepo;

    @MockBean ArologisDispatchClient arologisDispatchClient;
    @MockBean NotificationClient notificationClient;
    @MockBean NotificationChatRoomClient notificationChatRoomClient;
    @MockBean InventoryClient inventoryClient;
    @MockBean ProductClient productClient;
    @MockBean PartnerBlockClient partnerBlockClient;
    @MockBean PartnerInternalClient partnerInternalClient;
    @MockBean SmsGateway smsGateway;
    /** SP-08-FU1 — UserInternalClient @MockBean 격리 (ownerFullName graceful fallback). */
    @MockBean UserInternalClient userInternalClient;

    @org.junit.jupiter.api.BeforeEach
    void setUpUserInternalClient() {
        Mockito.lenient().when(userInternalClient.resolveFullName(ArgumentMatchers.any()))
                .thenReturn(java.util.Optional.of("담당자"));
    }

    @Test
    void task_create_then_add_group_lifecycle() {
        DispatchTask t = taskService.createTask(LocalDate.of(2026, 5, 14));
        assertThat(t.getTaskCode()).startsWith("2026/05/14-");
        assertThat(t.getStatus()).isEqualTo(DispatchTaskStatus.DRAFT);

        var group = taskService.addVehicleGroup(t.getId(), DispatchVehicleType.TONNAGE_1);
        assertThat(group.getSequence()).isEqualTo(1);
        assertThat(group.getVehicleType()).isEqualTo(DispatchVehicleType.TONNAGE_1);

        var loaded = taskRepo.findByTaskCodeAndIsDeletedFalse(t.getTaskCode());
        assertThat(loaded).isPresent();
    }

    @Test
    void confirm_after_DISPATCHING_marks_DISPATCHED() {
        // 1. Mock arologis 응답
        UUID arologisId = UUID.randomUUID();
        Mockito.when(arologisDispatchClient.send(ArgumentMatchers.any()))
                .thenReturn(new ArologisDispatchResponse(
                        arologisId, UUID.randomUUID(), Instant.now(), Instant.now()));

        // 2. Task 생성 + group 추가 + dispatch trigger (수동으로 status DISPATCHING)
        DispatchTask t = taskService.createTask(LocalDate.now());
        taskService.addVehicleGroup(t.getId(), DispatchVehicleType.TONNAGE_1);
        t.markDispatching();
        taskRepo.save(t);

        // 3. confirm
        DispatchTaskConfirmRequest req = new DispatchTaskConfirmRequest(
                arologisId,
                List.of(new DispatchTaskConfirmRequest.MatchedDriverPayload(
                        1, "TONNAGE_1", "D-001", "홍길동",
                        "010-1234-5678", "EXTERNAL_INSUNG_QUICK")),
                Instant.now());
        confirmService.confirm(t.getId(), req);

        DispatchTask reloaded = taskRepo.findById(t.getId()).orElseThrow();
        assertThat(reloaded.getStatus()).isEqualTo(DispatchTaskStatus.DISPATCHED);
        assertThat(reloaded.getArologisDispatchId()).isEqualTo(arologisId);
    }

    @Test
    void unavailable_after_DISPATCHING_marks_FAILED() {
        DispatchTask t = taskService.createTask(LocalDate.now());
        taskService.addVehicleGroup(t.getId(), DispatchVehicleType.TONNAGE_1);
        t.markDispatching();
        taskRepo.save(t);

        unavailableService.unavailable(t.getId(), new DispatchTaskUnavailableRequest(
                UUID.randomUUID(), "1톤 가용 기사 0명", List.of(1)));

        DispatchTask reloaded = taskRepo.findById(t.getId()).orElseThrow();
        assertThat(reloaded.getStatus()).isEqualTo(DispatchTaskStatus.FAILED);
        assertThat(reloaded.getFailureReason()).contains("0명");
    }
}
