package com.samhanair.logis.arologis.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.arologis.domain.ArologisNotifyChannel;
import com.samhanair.logis.arologis.domain.ArologisNotifyStatus;
import com.samhanair.logis.arologis.domain.DispatchNotification;
import com.samhanair.logis.arologis.domain.Vehicle;
import com.samhanair.logis.arologis.domain.VehicleTonnage;
import com.samhanair.logis.arologis.dto.NotifyResult;
import com.samhanair.logis.arologis.repository.DispatchNotificationRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * 배차 알림 발송이력 조립기 단위 테스트.
 */
class DispatchNotificationAssemblerTest {

    private final DispatchNotificationRepository repository = mock(DispatchNotificationRepository.class);
    private final DispatchNotificationAssembler assembler = new DispatchNotificationAssembler(repository);

    @Test
    void assemble_keeps_latest_notification_per_vehicle_and_channel() {
        UUID dispatchId = UUID.randomUUID();
        UUID vehicleId = UUID.randomUUID();
        UUID otherVehicleId = UUID.randomUUID();
        Vehicle vehicle = vehicle(dispatchId, vehicleId);
        LocalDateTime base = LocalDateTime.of(2026, 7, 14, 10, 0);
        DispatchNotification oldInsung = notification(
                dispatchId, vehicleId, ArologisNotifyChannel.INSUNG_TALK,
                ArologisNotifyStatus.FAILED, base, "010-1111-2222", "SEND_FAILED");
        DispatchNotification latestInsung = notification(
                dispatchId, vehicleId, ArologisNotifyChannel.INSUNG_TALK,
                ArologisNotifyStatus.SUCCESS, base.plusMinutes(5), "010-1111-2222", null);
        DispatchNotification latestAligo = notification(
                dispatchId, vehicleId, ArologisNotifyChannel.ALIGO,
                ArologisNotifyStatus.DELAYED, base.plusMinutes(3), "010-3333-4444", "WAITING");
        DispatchNotification ignoredOtherVehicle = notification(
                dispatchId, otherVehicleId, ArologisNotifyChannel.INSUNG_TALK,
                ArologisNotifyStatus.SUCCESS, base.plusMinutes(6), "010-9999-9999", null);
        when(repository.findAllByDispatchIdOrderBySentAtAsc(dispatchId))
                .thenReturn(List.of(oldInsung, latestAligo, latestInsung, ignoredOtherVehicle));

        Map<UUID, List<NotifyResult>> result = assembler.assemble(dispatchId, List.of(vehicle));

        assertThat(result).containsOnlyKeys(vehicleId);
        assertThat(result.get(vehicleId)).hasSize(2);
        assertThat(result.get(vehicleId)).extracting(NotifyResult::channel)
                .containsExactly("aligo", "insung-talk");
        assertThat(result.get(vehicleId)).anySatisfy(notify -> {
            assertThat(notify.channel()).isEqualTo("insung-talk");
            assertThat(notify.status()).isEqualTo(ArologisNotifyStatus.SUCCESS);
            assertThat(notify.sentAt()).isEqualTo(base.plusMinutes(5));
            assertThat(notify.recipientPhone()).isEqualTo("010-1111-2222");
            assertThat(notify.errorCode()).isNull();
        });
    }

    @Test
    void assemble_returns_empty_when_vehicle_or_notification_is_empty() {
        UUID dispatchId = UUID.randomUUID();
        when(repository.findAllByDispatchIdOrderBySentAtAsc(dispatchId)).thenReturn(List.of());

        assertThat(assembler.assemble(dispatchId, List.of())).isEmpty();
        assertThat(assembler.assemble(dispatchId, List.of(vehicle(dispatchId, UUID.randomUUID())))).isEmpty();
    }

    private static Vehicle vehicle(UUID dispatchId, UUID vehicleId) {
        Vehicle vehicle = Vehicle.of(dispatchId, 1, VehicleTonnage.TONNAGE_1, "상일");
        ReflectionTestUtils.setField(vehicle, "id", vehicleId);
        return vehicle;
    }

    private static DispatchNotification notification(UUID dispatchId, UUID vehicleId,
                                                     ArologisNotifyChannel channel,
                                                     ArologisNotifyStatus status,
                                                     LocalDateTime sentAt,
                                                     String recipientPhone,
                                                     String errorCode) {
        return DispatchNotification.of(dispatchId, vehicleId, channel, status, sentAt, recipientPhone, errorCode);
    }
}
