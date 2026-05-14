package com.samhanair.logis.arologis.service.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.arologis.client.SlipDispatchTaskClient;
import com.samhanair.logis.arologis.domain.Dispatch;
import com.samhanair.logis.arologis.domain.Driver;
import com.samhanair.logis.arologis.domain.DriverSource;
import com.samhanair.logis.arologis.domain.MatchSource;
import com.samhanair.logis.arologis.domain.Vehicle;
import com.samhanair.logis.arologis.domain.VehicleTonnage;
import com.samhanair.logis.arologis.dto.dispatch.ArologisDispatchRequest;
import com.samhanair.logis.arologis.dto.dispatch.ArologisDispatchResponse;
import com.samhanair.logis.arologis.dto.dispatch.SlipDispatchConfirmRequest;
import com.samhanair.logis.arologis.matcher.DriverMatchResult;
import com.samhanair.logis.arologis.matcher.DriverMatcher;
import com.samhanair.logis.arologis.repository.DispatchRepository;
import com.samhanair.logis.arologis.repository.VehicleRepository;
import com.samhanair.logis.arologis.repository.VehicleStopRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * {@link DispatchReceiveService} 단위 검증 — Samhan Public BE Task B13.
 */
@ExtendWith(MockitoExtension.class)
class DispatchReceiveServiceTest {

    @Mock DispatchRepository dispatchRepo;
    @Mock VehicleRepository vehicleRepo;
    @Mock VehicleStopRepository stopRepo;
    @Mock DriverMatcher driverMatcher;
    @Mock SlipDispatchTaskClient slipClient;
    @InjectMocks DispatchReceiveService svc;

    @Test
    void receive_creates_dispatch_vehicle_stop_and_returns_ack() throws Exception {
        UUID dispatchId = UUID.randomUUID();
        UUID vehicleId = UUID.randomUUID();
        UUID samhanTaskId = UUID.randomUUID();

        Dispatch dispatch = mockDispatch(dispatchId);
        Vehicle vehicle = mockVehicle(vehicleId, dispatchId);

        when(dispatchRepo.save(any())).thenReturn(dispatch);
        when(vehicleRepo.save(any())).thenReturn(vehicle);
        when(vehicleRepo.findById(vehicleId)).thenReturn(Optional.of(vehicle));
        when(stopRepo.findAllByVehicleIdOrderBySequenceAsc(vehicleId)).thenReturn(List.of());
        Driver driver = Driver.of("D-001", "010-1234-5678", "1톤",
                DriverSource.INTERNAL, Boolean.FALSE, null);
        Field driverIdField = Driver.class.getDeclaredField("id");
        driverIdField.setAccessible(true);
        driverIdField.set(driver, UUID.randomUUID());
        when(driverMatcher.match(any(), any())).thenReturn(
                DriverMatchResult.of(driver, MatchSource.INTERNAL_APP, "MOCK-REF"));

        ArologisDispatchRequest req = new ArologisDispatchRequest(
                samhanTaskId, "DT-20260514-001", LocalDate.of(2026, 5, 14),
                List.of(new ArologisDispatchRequest.VehicleGroup(1, "TONNAGE_1",
                        List.of(new ArologisDispatchRequest.SlipRef(
                                1, UUID.randomUUID(), "SL-001", "P-1234",
                                "대구공조", "인천 ...", "010-x", "9시 도착")))));

        ArologisDispatchResponse res = svc.receive(req);
        assertThat(res.arologisDispatchId()).isEqualTo(dispatchId);
        assertThat(res.samhanDispatchTaskId()).isEqualTo(samhanTaskId);

        verify(stopRepo).save(any());
        verify(driverMatcher).match(any(), any());
        verify(slipClient).confirm(eq(samhanTaskId), any(SlipDispatchConfirmRequest.class));
    }

    @Test
    void receive_with_matching_failure_calls_unavailable() throws Exception {
        UUID dispatchId = UUID.randomUUID();
        UUID vehicleId = UUID.randomUUID();
        UUID samhanTaskId = UUID.randomUUID();

        Dispatch dispatch = mockDispatch(dispatchId);
        Vehicle vehicle = mockVehicle(vehicleId, dispatchId);

        when(dispatchRepo.save(any())).thenReturn(dispatch);
        when(vehicleRepo.save(any())).thenReturn(vehicle);
        when(vehicleRepo.findById(vehicleId)).thenReturn(Optional.of(vehicle));
        when(stopRepo.findAllByVehicleIdOrderBySequenceAsc(vehicleId)).thenReturn(List.of());
        when(driverMatcher.match(any(), any()))
                .thenReturn(DriverMatchResult.empty(MatchSource.INTERNAL_APP));

        ArologisDispatchRequest req = new ArologisDispatchRequest(
                samhanTaskId, "DT-x", LocalDate.now(),
                List.of(new ArologisDispatchRequest.VehicleGroup(1, "TONNAGE_1", List.of())));

        svc.receive(req);

        verify(slipClient).unavailable(eq(samhanTaskId), any());
    }

    @Test
    void receive_with_invalid_vehicle_type_throws() throws Exception {
        Dispatch dispatch = mockDispatch(UUID.randomUUID());
        when(dispatchRepo.save(any())).thenReturn(dispatch);

        ArologisDispatchRequest req = new ArologisDispatchRequest(
                UUID.randomUUID(), "DT-x", LocalDate.now(),
                List.of(new ArologisDispatchRequest.VehicleGroup(1, "INVALID_TYPE", List.of())));

        try {
            svc.receive(req);
        } catch (IllegalArgumentException ex) {
            // expected — VehicleTonnage.valueOf("INVALID_TYPE") 발생
            return;
        }
        throw new AssertionError("IllegalArgumentException 미발생");
    }

    // ---- helpers ----

    private static Dispatch mockDispatch(UUID id) throws Exception {
        Dispatch d = Dispatch.of(LocalDate.now(),
                com.samhanair.logis.arologis.domain.DispatchType.DAY, "raw");
        Field f = Dispatch.class.getDeclaredField("id");
        f.setAccessible(true);
        f.set(d, id);
        return d;
    }

    private static Vehicle mockVehicle(UUID vehicleId, UUID dispatchId) throws Exception {
        Vehicle v = Vehicle.of(dispatchId, 1, VehicleTonnage.TONNAGE_1, "label");
        Field f = Vehicle.class.getDeclaredField("id");
        f.setAccessible(true);
        f.set(v, vehicleId);
        return v;
    }
}
