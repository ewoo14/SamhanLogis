package com.samhanair.logis.slip.repository.dispatch;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.domain.dispatch.DispatchTask;
import com.samhanair.logis.slip.domain.dispatch.DispatchTaskStatus;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroup;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroupSlip;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleType;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.transaction.annotation.Transactional;

/**
 * DispatchTask + VehicleGroup + Slip 매핑 + MatchedDriver partial unique IT (BE Task B4).
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@Transactional
@WithMockUser(username = "ewoo", authorities = {"ROLE_MASTER"})
class DispatchTaskRepositoryIT extends AbstractPostgresIT {

    @Autowired DispatchTaskRepository taskRepo;
    @Autowired DispatchVehicleGroupRepository groupRepo;
    @Autowired DispatchVehicleGroupSlipRepository slipMapRepo;

    @Test
    void save_and_lookup_by_code_active() {
        String taskCode = "DT-IT-" + UUID.randomUUID().toString().substring(0, 8);
        DispatchTask t = DispatchTask.create(taskCode, LocalDate.of(2099, 5, 14));
        taskRepo.save(t);

        assertThat(taskRepo.findByTaskCodeAndIsDeletedFalse(taskCode)).isPresent();
        assertThat(taskRepo.existsByTaskCodeAndIsDeletedFalse(taskCode)).isTrue();
    }

    @Test
    void findByDispatchDateBetween_filters_date_and_status() {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        LocalDate baseDate = LocalDate.of(2099, 6, 13);
        DispatchTask t1 = DispatchTask.create("DT-R-" + suffix + "-A", baseDate);
        DispatchTask t2 = DispatchTask.create("DT-R-" + suffix + "-B", baseDate.plusDays(1));
        DispatchTask t3 = DispatchTask.create("DT-R-" + suffix + "-C", baseDate.plusDays(7));
        taskRepo.save(t1);
        taskRepo.save(t2);
        taskRepo.save(t3);

        Page<DispatchTask> page = taskRepo.findByDispatchDateBetweenAndStatusInAndIsDeletedFalse(
                baseDate, baseDate.plusDays(2),
                Set.of(DispatchTaskStatus.DRAFT), PageRequest.of(0, 50));
        assertThat(page.getContent())
                .extracting(DispatchTask::getTaskCode)
                .containsExactlyInAnyOrder(t1.getTaskCode(), t2.getTaskCode());
    }

    @Test
    void vehicle_group_ordered_by_sequence() {
        DispatchTask t = DispatchTask.create("DT-VG", LocalDate.now());
        DispatchTask saved = taskRepo.save(t);

        DispatchVehicleGroup g1 = DispatchVehicleGroup.create(saved.getId(), 1, DispatchVehicleType.TONNAGE_1);
        DispatchVehicleGroup g2 = DispatchVehicleGroup.create(saved.getId(), 2, DispatchVehicleType.DAMAS);
        DispatchVehicleGroup g3 = DispatchVehicleGroup.create(saved.getId(), 3, DispatchVehicleType.TONNAGE_5);
        groupRepo.save(g1);
        groupRepo.save(g3);
        groupRepo.save(g2);

        List<DispatchVehicleGroup> ordered =
                groupRepo.findByDispatchTaskIdAndIsDeletedFalseOrderBySequenceAsc(saved.getId());
        assertThat(ordered).extracting(DispatchVehicleGroup::getSequence).containsExactly(1, 2, 3);
    }

    @Test
    void vehicle_group_slip_lookup_by_slip_id() {
        DispatchTask t = taskRepo.save(DispatchTask.create("DT-SLIP", LocalDate.now()));
        DispatchVehicleGroup g = groupRepo.save(DispatchVehicleGroup.create(t.getId(), 1, DispatchVehicleType.TONNAGE_1));

        UUID slipId = UUID.randomUUID();
        slipMapRepo.save(DispatchVehicleGroupSlip.create(g.getId(), slipId, 1));

        List<DispatchVehicleGroupSlip> bySlip = slipMapRepo.findBySlipIdAndIsDeletedFalse(slipId);
        assertThat(bySlip).hasSize(1);
        assertThat(bySlip.get(0).getVehicleGroupId()).isEqualTo(g.getId());
    }
}
