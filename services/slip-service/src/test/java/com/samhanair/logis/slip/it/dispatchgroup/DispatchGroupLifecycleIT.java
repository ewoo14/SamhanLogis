package com.samhanair.logis.slip.it.dispatchgroup;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.dispatchgroup.Carrier;
import com.samhanair.logis.slip.dto.dispatchgroup.CarrierRequests;
import com.samhanair.logis.slip.dto.dispatchgroup.DispatchGroupRequests;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.repository.dispatchgroup.CarrierRepository;
import com.samhanair.logis.slip.repository.dispatchgroup.DispatchGroupRepository;
import com.samhanair.logis.slip.service.dispatchgroup.CarrierService;
import com.samhanair.logis.slip.service.dispatchgroup.DispatchGroupService;
import com.samhanair.logis.slip.service.dispatchgroup.DispatchGroupSlipReferenceGuard;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/** S1 종료조건의 핵심 조합을 실제 persistence/service 경로에서 확인한다. */
@SpringBootTest(classes = SlipServiceApplication.class)
class DispatchGroupLifecycleIT extends AbstractPostgresIT {
    @Autowired private DispatchGroupService groupService;
    @Autowired private CarrierService carrierService;
    @Autowired private CarrierRepository carrierRepository;
    @Autowired private SlipRepository slipRepository;
    @Autowired private DispatchGroupSlipReferenceGuard referenceGuard;
    @Autowired private DispatchGroupRepository groupRepository;

    @Test
    void supports_outbound_and_inbound_but_rejects_duplicate_and_deleted_slip_paths() {
        LocalDate date = LocalDate.of(2026, 8, 4);
        UUID warehouse = UUID.randomUUID();
        Slip outbound = slipRepository.saveAndFlush(Slip.createOutbound("S1O" + UUID.randomUUID().toString().substring(0, 8), date, 1,
                warehouse, warehouse, null, null, DeliveryTag.DAY, null, "test"));
        Slip inbound = slipRepository.saveAndFlush(Slip.createInbound("S1I" + UUID.randomUUID().toString().substring(0, 8), date, 1,
                warehouse, null, null, DeliveryTag.RETURN, null, "test"));
        String groupNo = "S1-G-" + UUID.randomUUID();

        groupService.create(new DispatchGroupRequests.Create(groupNo, date, "2.5톤", null));
        groupService.addSlip(groupNo, new DispatchGroupRequests.AddSlip(outbound.getSlipNo(), com.samhanair.logis.slip.domain.dispatchgroup.InclusionType.OUTBOUND));
        groupService.addSlip(groupNo, new DispatchGroupRequests.AddSlip(inbound.getSlipNo(), com.samhanair.logis.slip.domain.dispatchgroup.InclusionType.INBOUND));
        assertThatThrownBy(() -> groupService.addSlip(groupNo,
                new DispatchGroupRequests.AddSlip(outbound.getSlipNo(), com.samhanair.logis.slip.domain.dispatchgroup.InclusionType.OUTBOUND)))
                .hasMessageContaining("이미 다른");
        assertThatThrownBy(() -> referenceGuard.assertDeletable(outbound.getId()))
                .hasMessageContaining("먼저 그룹에서 제외");
    }

    @Test
    void inactive_carrier_remains_on_existing_group_but_cannot_be_assigned_again() {
        Carrier carrier = Carrier.create("S1-" + UUID.randomUUID(), "임시 운송사", false, null);
        carrier = carrierRepository.saveAndFlush(carrier);
        String carrierCode = carrier.getCode();
        String groupNo = "S1-C-" + UUID.randomUUID();
        LocalDate date = LocalDate.of(2026, 8, 4);
        groupService.create(new DispatchGroupRequests.Create(groupNo, date, "1톤", carrierCode));
        carrierService.update(carrierCode, new CarrierRequests.Update(null, null, null, false));
        String second = "S1-C-" + UUID.randomUUID();
        groupService.create(new DispatchGroupRequests.Create(second, date, "1톤", null));
        assertThatThrownBy(() -> groupService.assignCarrier(second, carrierCode))
                .hasMessageContaining("비활성");
    }
}
