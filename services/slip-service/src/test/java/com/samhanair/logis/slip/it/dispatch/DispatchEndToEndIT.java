package com.samhanair.logis.slip.it.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.dispatch.DispatchTask;
import com.samhanair.logis.slip.domain.dispatch.DispatchTaskStatus;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleType;
import com.samhanair.logis.slip.domain.dispatch.MatchedDriverSource;
import com.samhanair.logis.slip.dto.dispatch.ArologisDispatchResponse;
import com.samhanair.logis.slip.dto.dispatch.DispatchTaskConfirmRequest;
import com.samhanair.logis.slip.dto.dispatch.DispatchTaskUnavailableRequest;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchTaskRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchVehicleGroupRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchVehicleGroupSlipRepository;
import com.samhanair.logis.slip.service.dispatch.DispatchTaskConfirmService;
import com.samhanair.logis.slip.service.dispatch.DispatchTaskCompletionService;
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
import org.springframework.test.util.ReflectionTestUtils;

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
    @Autowired DispatchTaskCompletionService completionService;
    @Autowired DispatchTaskUnavailableService unavailableService;
    @Autowired DispatchTaskRepository taskRepo;
    @Autowired SlipRepository slipRepo;
    @Autowired DispatchVehicleGroupRepository groupRepo;
    @Autowired DispatchVehicleGroupSlipRepository slipMapRepo;

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

        // 2. Task 생성 + group 추가 + 실제 dispatch trigger
        DispatchTask t = taskService.createTask(LocalDate.now());
        taskService.addVehicleGroup(t.getId(), DispatchVehicleType.TONNAGE_1);
        completionService.dispatch(t.getId());

        // 3. confirm
        DispatchTaskConfirmRequest req = new DispatchTaskConfirmRequest(
                arologisId,
                List.of(new DispatchTaskConfirmRequest.MatchedDriverPayload(
                        1, "TONNAGE_1", "D-001", "홍길동",
                        "010-1234-5678", MatchedDriverSource.AROLOGIS, null)),
                Instant.now());
        confirmService.confirm(t.getId(), req);

        DispatchTask reloaded = taskRepo.findById(t.getId()).orElseThrow();
        assertThat(reloaded.getStatus()).isEqualTo(DispatchTaskStatus.DISPATCHED);
        assertThat(reloaded.getArologisDispatchId()).isEqualTo(arologisId);
    }

    @Test
    void unavailable_after_DISPATCHING_marks_FAILED() {
        Mockito.when(arologisDispatchClient.send(ArgumentMatchers.any()))
                .thenReturn(new ArologisDispatchResponse(
                        UUID.randomUUID(), UUID.randomUUID(), Instant.now(), Instant.now()));

        DispatchTask t = taskService.createTask(LocalDate.now());
        taskService.addVehicleGroup(t.getId(), DispatchVehicleType.TONNAGE_1);
        completionService.dispatch(t.getId());

        unavailableService.unavailable(t.getId(), new DispatchTaskUnavailableRequest(
                UUID.randomUUID(), "1톤 가용 기사 0명", List.of(1)));

        DispatchTask reloaded = taskRepo.findById(t.getId()).orElseThrow();
        assertThat(reloaded.getStatus()).isEqualTo(DispatchTaskStatus.FAILED);
        assertThat(reloaded.getFailureReason()).contains("0명");
    }

    @Test
    void dispatched_group_rejects_assign_reorder_remove() {
        Mockito.when(arologisDispatchClient.send(ArgumentMatchers.any()))
                .thenReturn(new ArologisDispatchResponse(
                        UUID.randomUUID(), UUID.randomUUID(), Instant.now(), Instant.now()));

        DispatchTask task = taskService.createTask(LocalDate.now());
        var group = taskService.addVehicleGroup(task.getId(), DispatchVehicleType.TONNAGE_1);
        Slip first = slipRepo.save(newSlip(1));
        taskService.assignSlip(task.getId(), group.getId(), first.getId());

        completionService.dispatch(task.getId());

        Slip second = slipRepo.save(newSlip(2));
        assertThatThrownBy(() -> taskService.assignSlip(task.getId(), group.getId(), second.getId()))
                .hasMessageContaining("이미 발송된 차량 그룹에는 전표를 추가할 수 없습니다.");
        assertThatThrownBy(() -> taskService.reorderSlips(group.getId(), List.of(first.getId())))
                .hasMessageContaining("이미 발송된 차량 그룹의 전표 순서는 변경할 수 없습니다.");
        assertThatThrownBy(() -> taskService.removeSlipFromGroup(group.getId(), first.getId(), "ewoo", null))
                .hasMessageContaining("이미 발송된 차량 그룹의 전표는 제거할 수 없습니다.");
    }

    @Test
    void findOrCreateTodayDraft_is_idempotent_until_existing_draft_is_dispatched() {
        Mockito.when(arologisDispatchClient.send(ArgumentMatchers.any()))
                .thenReturn(new ArologisDispatchResponse(
                        UUID.randomUUID(), UUID.randomUUID(), Instant.now(), Instant.now()));

        LocalDate date = LocalDate.of(2099, 6, 12);
        DispatchTask first = taskService.findOrCreateTodayDraft(date);
        DispatchTask second = taskService.findOrCreateTodayDraft(date);
        assertThat(second.getId()).isEqualTo(first.getId());

        taskService.addVehicleGroup(first.getId(), DispatchVehicleType.TONNAGE_1);
        completionService.dispatch(first.getId());

        DispatchTask afterDispatch = taskService.findOrCreateTodayDraft(date);
        assertThat(afterDispatch.getId()).isNotEqualTo(first.getId());
        assertThat(afterDispatch.getStatus()).isEqualTo(DispatchTaskStatus.DRAFT);
    }

    @Test
    void remove_group_stamps_shared_deletedAt_and_restore_cascades() {
        DispatchTask task = taskService.createTask(LocalDate.of(2099, 7, 2));
        var group = taskService.addVehicleGroup(task.getId(), DispatchVehicleType.TONNAGE_1);
        Slip s1 = slipRepo.save(newSlip(10));
        Slip s2 = slipRepo.save(newSlip(11));
        taskService.assignSlip(task.getId(), group.getId(), s1.getId());
        taskService.assignSlip(task.getId(), group.getId(), s2.getId());

        taskService.removeVehicleGroup(task.getId(), group.getId(), "ewoo", "홍길동");

        var deletedGroup = groupRepo.findByIdIncludingDeleted(group.getId()).orElseThrow();
        assertThat(deletedGroup.getIsDeleted()).isTrue();
        assertThat(deletedGroup.getDeletedByName()).isEqualTo("홍길동");
        // 공유 삭제 시각 등호 매칭 — 실 PG timestamp 절삭 후에도 그룹 deleted_at 으로 cascade
        // 매핑 2건이 정확히 잡혀야 한다 (±윈도우 휴리스틱 제거의 실증).
        var cascade = slipMapRepo.findDeletedCascadeMappings(
                group.getId(), deletedGroup.getDeletedBy(), deletedGroup.getDeletedAt());
        assertThat(cascade).hasSize(2);

        taskService.restoreVehicleGroup(task.getId(), group.getId(), "ewoo", "복원자");

        var restored = groupRepo.findByIdIncludingDeleted(group.getId()).orElseThrow();
        assertThat(restored.getIsDeleted()).isFalse();
        assertThat(restored.getDeletedByName()).isNull();
        assertThat(slipMapRepo.findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(group.getId()))
                .hasSize(2);
    }

    @Test
    void restore_group_reassigns_sequence_when_reused_by_new_group() {
        DispatchTask task = taskService.createTask(LocalDate.of(2099, 7, 3));
        var first = taskService.addVehicleGroup(task.getId(), DispatchVehicleType.TONNAGE_1);
        taskService.removeVehicleGroup(task.getId(), first.getId(), "ewoo", "홍길동");
        // 삭제로 비워진 sequence 1 을 새 그룹이 재사용 — (task, sequence) 활성 partial unique 점유.
        var occupant = taskService.addVehicleGroup(task.getId(), DispatchVehicleType.TONNAGE_1);
        assertThat(occupant.getSequence()).isEqualTo(1);

        // 실 PG unique index 위에서 복원 — 말번 재부여가 없으면 23505 로 터지던 시나리오.
        taskService.restoreVehicleGroup(task.getId(), first.getId(), "ewoo", "복원자");

        var restored = groupRepo.findByIdIncludingDeleted(first.getId()).orElseThrow();
        assertThat(restored.getIsDeleted()).isFalse();
        assertThat(restored.getSequence()).isEqualTo(2);
    }

    @Test
    void restore_slip_with_active_duplicate_throws_conflict() {
        DispatchTask task = taskService.createTask(LocalDate.of(2099, 7, 4));
        var group = taskService.addVehicleGroup(task.getId(), DispatchVehicleType.TONNAGE_1);
        Slip slip = slipRepo.save(newSlip(12));
        taskService.assignSlip(task.getId(), group.getId(), slip.getId());
        taskService.removeSlipFromGroup(group.getId(), slip.getId(), "ewoo", "홍길동");
        // 취소선 기간 중 같은 전표 재추가 — 같은 그룹에 활성/삭제 매핑 공존.
        taskService.assignSlip(task.getId(), group.getId(), slip.getId());

        // 복원 강행 시 (vehicle_group_id, slip_id) 활성 unique 위반 — 409 로 차단되어야 한다.
        assertThatThrownBy(() -> taskService.restoreSlipFromGroup(
                task.getId(), group.getId(), slip.getId(), null, "ewoo", "복원자"))
                .hasMessageContaining("이미 활성 배차 매핑이 있는 전표입니다");
    }

    @Test
    void restore_slip_with_mapping_id_restores_selected_tombstone_leaving_others() {
        DispatchTask task = taskService.createTask(LocalDate.of(2099, 7, 6));
        var group = taskService.addVehicleGroup(task.getId(), DispatchVehicleType.TONNAGE_1);
        Slip slip = slipRepo.save(newSlip(14));
        // 제거→재추가→재제거 = 같은 (그룹,전표)에 삭제 tombstone 2건.
        UUID firstMappingId = taskService.assignSlip(task.getId(), group.getId(), slip.getId()).getId();
        taskService.removeSlipFromGroup(group.getId(), slip.getId(), "ewoo", "홍길동");
        UUID secondMappingId = taskService.assignSlip(task.getId(), group.getId(), slip.getId()).getId();
        taskService.removeSlipFromGroup(group.getId(), slip.getId(), "ewoo", "홍길동");

        // mappingId 없이 복원 = 다건 tombstone 이라 임의 복원 대신 409.
        assertThatThrownBy(() -> taskService.restoreSlipFromGroup(
                task.getId(), group.getId(), slip.getId(), null, "ewoo", "복원자"))
                .hasMessageContaining("삭제된 전표 매핑이 여러 건입니다");

        // mappingId 로 두 번째 tombstone 지정 복원 = native findByIdIncludingDeleted 실 PG 검증.
        taskService.restoreSlipFromGroup(
                task.getId(), group.getId(), slip.getId(), secondMappingId, "ewoo", "복원자");

        assertThat(slipMapRepo.findByIdIncludingDeleted(secondMappingId).orElseThrow().getIsDeleted()).isFalse();
        assertThat(slipMapRepo.findByIdIncludingDeleted(firstMappingId).orElseThrow().getIsDeleted()).isTrue();
    }

    @Test
    void restore_group_excludes_mapping_reassigned_to_other_group() {
        DispatchTask task = taskService.createTask(LocalDate.of(2099, 7, 5));
        var groupA = taskService.addVehicleGroup(task.getId(), DispatchVehicleType.TONNAGE_1);
        var groupB = taskService.addVehicleGroup(task.getId(), DispatchVehicleType.TONNAGE_1);
        Slip slip = slipRepo.save(newSlip(13));
        taskService.assignSlip(task.getId(), groupA.getId(), slip.getId());
        taskService.removeVehicleGroup(task.getId(), groupA.getId(), "ewoo", "홍길동");
        // 취소선 기간 중 다른 그룹으로 재배정.
        taskService.assignSlip(task.getId(), groupB.getId(), slip.getId());

        taskService.restoreVehicleGroup(task.getId(), groupA.getId(), "ewoo", "복원자");

        var restoredGroup = groupRepo.findByIdIncludingDeleted(groupA.getId()).orElseThrow();
        assertThat(restoredGroup.getIsDeleted()).isFalse();
        // 이중 배차 방지 — groupA 쪽 매핑은 tombstone 잔존, 활성 매핑은 groupB 1건뿐.
        assertThat(slipMapRepo.findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(groupA.getId()))
                .isEmpty();
        assertThat(slipMapRepo.findBySlipIdAndIsDeletedFalse(slip.getId()))
                .singleElement()
                .satisfies(m -> assertThat(m.getVehicleGroupId()).isEqualTo(groupB.getId()));
    }

    private Slip newSlip(int seq) {
        Slip slip = Slip.createOutbound(
                "2099/06/12-DEND-%03d".formatted(seq),
                LocalDate.now(),
                seq,
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                "배차 IT 거래처 %d".formatted(seq),
                DeliveryTag.SALE,
                "배차 e2e IT",
                "ewoo");
        ReflectionTestUtils.setField(slip, "partnerCode", "P-DEND-%03d".formatted(seq));
        slip.withProjectInfo(null, "서울시 강남구 테스트로 %d".formatted(seq), null, null,
                "010-0000-%04d".formatted(seq), null);
        return slip;
    }
}
