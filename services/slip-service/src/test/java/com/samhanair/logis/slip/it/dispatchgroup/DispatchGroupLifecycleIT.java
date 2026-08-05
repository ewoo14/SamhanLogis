package com.samhanair.logis.slip.it.dispatchgroup;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.times;

import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.dispatchgroup.Carrier;
import com.samhanair.logis.slip.domain.dispatchgroup.TransferStatus;
import com.samhanair.logis.slip.client.ArologisDispatchGroupClient;
import com.samhanair.logis.slip.dto.dispatchgroup.DispatchGroupTransferRequest;
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
import org.springframework.boot.test.mock.mockito.MockBean;

/** S1 종료조건의 핵심 조합을 실제 persistence/service 경로에서 확인한다. */
@SpringBootTest(classes = SlipServiceApplication.class)
class DispatchGroupLifecycleIT extends AbstractPostgresIT {
    @Autowired private DispatchGroupService groupService;
    @Autowired private CarrierService carrierService;
    @Autowired private CarrierRepository carrierRepository;
    @Autowired private SlipRepository slipRepository;
    @Autowired private DispatchGroupSlipReferenceGuard referenceGuard;
    @Autowired private DispatchGroupRepository groupRepository;
    @MockBean private ArologisDispatchGroupClient arologisClient;

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

    @Test
    void lost_transfer_responses_stay_pending_then_converge_without_duplicate_group() {
        Carrier carrier = carrierRepository.saveAndFlush(
                Carrier.create("S16-" + UUID.randomUUID(), "S16 아로로지스", true, null));
        LocalDate date = LocalDate.of(2026, 8, 5);
        UUID warehouse = UUID.randomUUID();
        Slip slip = slipRepository.saveAndFlush(Slip.createOutbound(
                "S16O" + UUID.randomUUID().toString().substring(0, 8), date, 1,
                warehouse, warehouse, null, null, DeliveryTag.DAY, null, "s16"));
        String groupNo = "S16-T-" + UUID.randomUUID();
        groupService.create(new DispatchGroupRequests.Create(groupNo, date, "1톤", carrier.getCode()));
        groupService.addSlip(groupNo, new DispatchGroupRequests.AddSlip(
                slip.getSlipNo(), com.samhanair.logis.slip.domain.dispatchgroup.InclusionType.OUTBOUND));

        doThrow(new RuntimeException("response lost")).when(arologisClient)
                .send(any(DispatchGroupTransferRequest.class));

        assertThatThrownBy(() -> groupService.transfer(groupNo))
                .hasMessageContaining("결과 확인 중");
        assertThat(groupRepository.findByGroupNoAndIsDeletedFalse(groupNo).orElseThrow()
                .getTransferStatus()).isEqualTo(TransferStatus.PENDING);

        org.mockito.Mockito.doNothing().when(arologisClient)
                .send(any(DispatchGroupTransferRequest.class));
        groupService.retryPendingTransfers();

        assertThat(groupRepository.findByGroupNoAndIsDeletedFalse(groupNo).orElseThrow()
                .getTransferStatus()).isEqualTo(TransferStatus.SENT);
        verify(arologisClient, times(3)).send(any(DispatchGroupTransferRequest.class));
    }

    @Test
    void sent_carrier_cannot_be_changed_through_hr_master() {
        Carrier carrier = carrierRepository.saveAndFlush(
                Carrier.create("S16-C-" + UUID.randomUUID(), "잠금 운송사", true, null));
        String groupNo = "S16-CG-" + UUID.randomUUID();
        groupService.create(new DispatchGroupRequests.Create(
                groupNo, LocalDate.of(2026, 8, 5), "1톤", carrier.getCode()));
        var group = groupRepository.findByGroupNoAndIsDeletedFalse(groupNo).orElseThrow();
        group.markTransferSent();
        groupRepository.saveAndFlush(group);

        assertThatThrownBy(() -> carrierService.update(carrier.getCode(),
                new CarrierRequests.Update(null, "변경 시도", null, true)))
                .hasMessageContaining("전송 완료");
    }
}
