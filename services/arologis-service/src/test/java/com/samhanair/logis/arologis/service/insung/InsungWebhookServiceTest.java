package com.samhanair.logis.arologis.service.insung;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.arologis.domain.Driver;
import com.samhanair.logis.arologis.domain.DriverSource;
import com.samhanair.logis.arologis.domain.Vehicle;
import com.samhanair.logis.arologis.domain.VehicleTonnage;
import com.samhanair.logis.arologis.dto.insung.InsungMatchResultRequest;
import com.samhanair.logis.arologis.repository.DriverRepository;
import com.samhanair.logis.arologis.repository.SignatureRepository;
import com.samhanair.logis.arologis.repository.VehicleRepository;
import com.samhanair.logis.arologis.repository.VehicleStopRepository;
import java.lang.reflect.Field;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * 인성 webhook 매칭 결과는 vendor 식별자 결손/중복 배정 경로를 fail-soft 로 처리한다.
 */
@ExtendWith(MockitoExtension.class)
class InsungWebhookServiceTest {

    @Mock VehicleRepository vehicleRepository;
    @Mock VehicleStopRepository vehicleStopRepository;
    @Mock DriverRepository driverRepository;
    @Mock SignatureRepository signatureRepository;

    @Test
    void handleMatchResult_without_vendorDriverId_marks_failed_without_driver_creation() {
        Vehicle vehicle = Vehicle.of(UUID.randomUUID(), 1, VehicleTonnage.TONNAGE_1, null);
        when(vehicleRepository.findByVendorOrderId("VENDOR-ORD-NO-DRIVER"))
                .thenReturn(Optional.of(vehicle));

        service().handleMatchResult(new InsungMatchResultRequest(
                "VENDOR-ORD-NO-DRIVER", true, null, "Driver",
                "010-1234-5678", "1T", "12A3456", null));

        assertThat(vehicle.getVendorStatus()).isEqualTo("MATCH_FAILED");
        verify(driverRepository, never()).findByDriverCode(any());
        verify(driverRepository, never()).save(any());
    }

    @Test
    void handleMatchResult_updates_existing_driver_without_duplicate_row() throws Exception {
        Vehicle vehicle = Vehicle.of(UUID.randomUUID(), 1, VehicleTonnage.TONNAGE_1, null);
        setId(vehicle, UUID.randomUUID());
        Driver existing = Driver.of("INSUNG-DRV-111", "Old Driver", "010-0000-0000",
                "OLD", "00A0000", DriverSource.EXTERNAL_INSUNG_QUICK, Boolean.FALSE, null);
        setId(existing, UUID.randomUUID());

        when(vehicleRepository.findByVendorOrderId("VENDOR-ORD-111")).thenReturn(Optional.of(vehicle));
        when(driverRepository.findByDriverCode("INSUNG-DRV-111")).thenReturn(Optional.of(existing));

        service().handleMatchResult(new InsungMatchResultRequest(
                "VENDOR-ORD-111", true, "DRV-111", "New Driver",
                "010-1234-5678-EXTRA-LONG", "VEHICLE-TYPE-OVER-20-CHARS", "12A3456", null));

        assertThat(existing.getDriverName()).isEqualTo("New Driver");
        assertThat(existing.getPhoneNumber()).hasSize(20);
        assertThat(existing.getVehicleType()).hasSize(20);
        assertThat(existing.getVehiclePlateNumber()).isEqualTo("12A3456");
        assertThat(vehicle.getVendorStatus()).isEqualTo("ASSIGNED");
        verify(driverRepository, never()).save(any());
    }

    private InsungWebhookService service() {
        return new InsungWebhookService(
                vehicleRepository, vehicleStopRepository, driverRepository, signatureRepository);
    }

    private static void setId(Object entity, UUID id) throws Exception {
        Field f = entity.getClass().getDeclaredField("id");
        f.setAccessible(true);
        f.set(entity, id);
    }
}
