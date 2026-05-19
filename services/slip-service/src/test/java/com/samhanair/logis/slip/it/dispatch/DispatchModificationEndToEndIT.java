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
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.delivery.sms.SmsGateway;
import com.samhanair.logis.slip.domain.dispatch.DispatchTask;
import com.samhanair.logis.slip.domain.dispatch.DispatchTaskStatus;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleType;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import com.samhanair.logis.slip.repository.dispatch.DispatchTaskRepository;
import com.samhanair.logis.slip.service.dispatch.DispatchTaskCancellationDecisionService;
import com.samhanair.logis.slip.service.dispatch.DispatchTaskCancellationRequestService;
import com.samhanair.logis.slip.service.dispatch.DispatchTaskModificationDecisionService;
import com.samhanair.logis.slip.service.dispatch.DispatchTaskModificationRequestService;
import com.samhanair.logis.slip.service.dispatch.DispatchTaskService;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.security.test.context.support.WithMockUser;

/**
 * Phase C — 배차 수정/취소 흐름 e2e IT (BE Task B8).
 *
 * <p>Service 레이어에서 DISPATCHED 상태부터 시작하여 수정 수락/거부 + 취소 수락 3 시나리오 검증.
 *
 * <p>외부 client (ArologisDispatchClient / NotificationClient 등) 모두 @MockBean — Phase A IT
 * 패턴 일관 ({@code feedback_it_mockbean_external_clients.md}).
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@WithMockUser(username = "ewoo", authorities = {"ROLE_MASTER"})
class DispatchModificationEndToEndIT extends AbstractPostgresIT {

    @Autowired DispatchTaskService taskService;
    @Autowired DispatchTaskModificationRequestService modificationRequestService;
    @Autowired DispatchTaskCancellationRequestService cancellationRequestService;
    @Autowired DispatchTaskModificationDecisionService modificationDecisionService;
    @Autowired DispatchTaskCancellationDecisionService cancellationDecisionService;
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
    /** SP-08-FU2 P2-2 — WarehouseInternalClient @MockBean 격리. */
    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    @org.junit.jupiter.api.BeforeEach
    void setUpUserInternalClient() {
        org.mockito.Mockito.lenient().when(userInternalClient.resolveFullName(org.mockito.ArgumentMatchers.any()))
                .thenReturn(java.util.Optional.of("담당자"));
    }

    @Test
    void dispatched_then_modification_request_accepted_marks_MODIFICATION_ACCEPTED() {
        DispatchTask t = setupDispatchedTask();

        // 수정 요청 → MODIFICATION_REQUESTED
        modificationRequestService.request(t.getId(), "슬립 추가 + 정차 순서 변경", "user-a");
        DispatchTask afterRequest = taskRepo.findById(t.getId()).orElseThrow();
        assertThat(afterRequest.getStatus()).isEqualTo(DispatchTaskStatus.MODIFICATION_REQUESTED);
        assertThat(afterRequest.getModificationReason()).isEqualTo("슬립 추가 + 정차 순서 변경");
        assertThat(afterRequest.getModificationRequestedAt()).isNotNull();

        // arologis 수락 회신 → MODIFICATION_ACCEPTED
        modificationDecisionService.accept(t.getId(), "arologis-master");
        DispatchTask afterAccept = taskRepo.findById(t.getId()).orElseThrow();
        assertThat(afterAccept.getStatus()).isEqualTo(DispatchTaskStatus.MODIFICATION_ACCEPTED);
        assertThat(afterAccept.getModificationDecidedAt()).isNotNull();
    }

    @Test
    void dispatched_then_cancellation_request_accepted_marks_CANCELLED() {
        DispatchTask t = setupDispatchedTask();

        // 취소 요청 → CANCEL_REQUESTED
        cancellationRequestService.request(t.getId(), "거래처 일정 변경", "user-a");
        DispatchTask afterRequest = taskRepo.findById(t.getId()).orElseThrow();
        assertThat(afterRequest.getStatus()).isEqualTo(DispatchTaskStatus.CANCEL_REQUESTED);

        // arologis 수락 회신 → CANCEL_ACCEPTED → CANCELLED (cascade undispatch + final)
        cancellationDecisionService.accept(t.getId(), "arologis-master");
        DispatchTask afterAccept = taskRepo.findById(t.getId()).orElseThrow();
        assertThat(afterAccept.getStatus()).isEqualTo(DispatchTaskStatus.CANCELLED);
        assertThat(afterAccept.getModificationDecidedAt()).isNotNull();
    }

    @Test
    void modification_rejected_records_rejection_reason() {
        DispatchTask t = setupDispatchedTask();

        modificationRequestService.request(t.getId(), null, "user-a");

        // arologis 거부 회신 → MODIFICATION_REJECTED
        modificationDecisionService.reject(t.getId(), "기사 일정 충돌", "arologis-master");
        DispatchTask afterReject = taskRepo.findById(t.getId()).orElseThrow();
        assertThat(afterReject.getStatus()).isEqualTo(DispatchTaskStatus.MODIFICATION_REJECTED);
        assertThat(afterReject.getRejectionReason()).isEqualTo("기사 일정 충돌");
    }

    /** DRAFT → DISPATCHED 까지 진행한 Task 반환 (수동으로 status 전이 + arologisDispatchId 설정). */
    private DispatchTask setupDispatchedTask() {
        DispatchTask t = taskService.createTask(LocalDate.now());
        taskService.addVehicleGroup(t.getId(), DispatchVehicleType.TONNAGE_1);
        t.markDispatching();
        t.markDispatched(UUID.randomUUID());
        taskRepo.save(t);
        return t;
    }
}
