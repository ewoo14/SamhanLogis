package com.samhanair.logis.arologis.service.copy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.arologis.client.SlipClient;
import com.samhanair.logis.arologis.domain.Signature;
import com.samhanair.logis.arologis.domain.SignatureSource;
import com.samhanair.logis.arologis.domain.Vehicle;
import com.samhanair.logis.arologis.domain.VehicleStop;
import com.samhanair.logis.arologis.repository.SignatureRepository;
import com.samhanair.logis.arologis.repository.VehicleRepository;
import com.samhanair.logis.arologis.repository.VehicleStopRepository;
import com.samhanair.logis.arologis.service.SlipResolver;
import com.samhanair.logis.arologis.web.dto.copy.SignAndSendCopyRequest;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.SimpleTransactionStatus;

/**
 * Phase F (D-DF-01~10) — SignAndSendCopyService Tx1 + Tx2 orchestration 단위 테스트.
 */
class SignAndSendCopyServiceTest {

    private SignatureRepository signatureRepo;
    private VehicleRepository vehicleRepo;
    private VehicleStopRepository stopRepo;
    private SlipResolver slipResolver;
    private SlipClient slipClient;
    private PlaywrightCopyRenderer renderer;
    private CopyImageDiskStorage storage;
    private SignAndSendCopyService service;

    private final UUID DISPATCH_ID = UUID.randomUUID();
    private final UUID DRIVER_ID = UUID.randomUUID();
    private final UUID VEHICLE_ID = UUID.randomUUID();
    private final UUID STOP_ID = UUID.randomUUID();
    private final UUID SLIP_ID = UUID.randomUUID();

    private Vehicle vehicle;
    private VehicleStop stop;

    @BeforeEach
    void setUp() {
        signatureRepo = mock(SignatureRepository.class);
        vehicleRepo = mock(VehicleRepository.class);
        stopRepo = mock(VehicleStopRepository.class);
        slipResolver = mock(SlipResolver.class);
        slipClient = mock(SlipClient.class);
        renderer = mock(PlaywrightCopyRenderer.class);
        storage = mock(CopyImageDiskStorage.class);
        service = new SignAndSendCopyService(signatureRepo, vehicleRepo, stopRepo, slipResolver,
                slipClient, renderer, storage, transactionManager());

        vehicle = mock(Vehicle.class);
        when(vehicle.getId()).thenReturn(VEHICLE_ID);
        when(vehicle.getAssignedDriverId()).thenReturn(DRIVER_ID);

        stop = mock(VehicleStop.class);
        when(stop.getId()).thenReturn(STOP_ID);

        when(vehicleRepo.findFirstByDispatchIdAndSequence(DISPATCH_ID, 1)).thenReturn(Optional.of(vehicle));
        when(stopRepo.findFirstByVehicleIdAndSequence(VEHICLE_ID, 1)).thenReturn(Optional.of(stop));
        when(slipResolver.resolveSlipId(stop)).thenReturn(Optional.of(SLIP_ID));
        when(slipResolver.buildSlipDataMap(stop))
                .thenReturn(Map.of("slipNo", "SL-001", "partnerName", "대구공조"));
    }

    private SignAndSendCopyRequest req() {
        return new SignAndSendCopyRequest("driverB64", "recipientB64",
                LocalDateTime.now(), new BigDecimal("37.4979"), new BigDecimal("127.0276"), null);
    }

    private PlatformTransactionManager transactionManager() {
        return new PlatformTransactionManager() {
            @Override
            public TransactionStatus getTransaction(TransactionDefinition definition) {
                return new SimpleTransactionStatus();
            }

            @Override
            public void commit(TransactionStatus status) {
            }

            @Override
            public void rollback(TransactionStatus status) {
            }
        };
    }

    private Signature newSignature() {
        return Signature.of(STOP_ID, SignatureSource.APP, "x", LocalDateTime.now(), null, null);
    }

    @Test
    void execute_success_returns_png_and_marks_sent() throws Exception {
        when(signatureRepo.findAllByStopIdOrderByCapturedAtDesc(STOP_ID)).thenReturn(List.of());
        Signature signature = newSignature();
        when(signatureRepo.save(any(Signature.class))).thenReturn(signature);
        when(slipClient.registerSignature(eq(SLIP_ID), any())).thenReturn(true);
        when(slipResolver.findRecipientPhone(stop)).thenReturn(Optional.of("01012345678"));
        when(renderer.render(any(), any(), any())).thenReturn(new byte[]{(byte) 0x89, 0x50});
        when(storage.save(any(), any(byte[].class)))
                .thenReturn("/var/lib/arologis/signature-copies/x.png");

        var result = service.execute(DISPATCH_ID, 1, 1, DRIVER_ID, req());

        assertThat(result.png()).isNotNull();
        assertThat(result.copySentAt()).isNotNull();
        assertThat(result.copyRecipientPhoneMasked()).isEqualTo("010-****-5678");
        assertThat(result.alreadySent()).isFalse();
        assertThat(signature.isCopySent()).isTrue();
    }

    @Test
    void execute_already_sent_returns_alreadySent() {
        Signature existing = newSignature();
        existing.markCopySent("/already.png", "01012345678");
        when(signatureRepo.findAllByStopIdOrderByCapturedAtDesc(STOP_ID)).thenReturn(List.of(existing));

        var result = service.execute(DISPATCH_ID, 1, 1, DRIVER_ID, req());

        assertThat(result.alreadySent()).isTrue();
        assertThat(result.previousCopySentAt()).isNotNull();
        verify(renderer, never()).render(any(), any(), any());
    }

    @Test
    void execute_phone_missing_returns_phoneMissing_after_signature_save() {
        when(signatureRepo.findAllByStopIdOrderByCapturedAtDesc(STOP_ID)).thenReturn(List.of());
        Signature signature = newSignature();
        when(signatureRepo.save(any(Signature.class))).thenReturn(signature);
        when(slipClient.registerSignature(eq(SLIP_ID), any())).thenReturn(true);
        when(slipResolver.findRecipientPhone(stop)).thenReturn(Optional.empty());

        var result = service.execute(DISPATCH_ID, 1, 1, DRIVER_ID, req());

        assertThat(result.failureReason()).isEqualTo(CopyFailureReason.RECIPIENT_PHONE_MISSING);
        assertThat(result.png()).isNull();
        verify(renderer, never()).render(any(), any(), any());
    }

    @Test
    void execute_renderer_timeout_returns_RENDERER_TIMEOUT() {
        when(signatureRepo.findAllByStopIdOrderByCapturedAtDesc(STOP_ID)).thenReturn(List.of());
        Signature signature = newSignature();
        when(signatureRepo.save(any(Signature.class))).thenReturn(signature);
        when(slipClient.registerSignature(eq(SLIP_ID), any())).thenReturn(true);
        when(slipResolver.findRecipientPhone(stop)).thenReturn(Optional.of("01012345678"));
        when(renderer.render(any(), any(), any()))
                .thenThrow(new PlaywrightCopyRenderer.RendererTimeoutException("timeout", null));

        var result = service.execute(DISPATCH_ID, 1, 1, DRIVER_ID, req());

        assertThat(result.failureReason()).isEqualTo(CopyFailureReason.RENDERER_TIMEOUT);
        assertThat(signature.getCopySendFailureCount()).isEqualTo(1);
    }

    @Test
    void execute_storage_io_returns_STORAGE_FULL() throws Exception {
        when(signatureRepo.findAllByStopIdOrderByCapturedAtDesc(STOP_ID)).thenReturn(List.of());
        Signature signature = newSignature();
        when(signatureRepo.save(any(Signature.class))).thenReturn(signature);
        when(slipClient.registerSignature(eq(SLIP_ID), any())).thenReturn(true);
        when(slipResolver.findRecipientPhone(stop)).thenReturn(Optional.of("01012345678"));
        when(renderer.render(any(), any(), any())).thenReturn(new byte[]{0x01});
        when(storage.save(any(), any(byte[].class)))
                .thenThrow(new java.io.IOException("disk full"));

        var result = service.execute(DISPATCH_ID, 1, 1, DRIVER_ID, req());

        assertThat(result.failureReason()).isEqualTo(CopyFailureReason.STORAGE_FULL);
        assertThat(signature.getCopySendFailureCount()).isEqualTo(1);
    }

    @Test
    void execute_other_driver_throws_SecurityException() {
        UUID otherDriver = UUID.randomUUID();

        assertThatThrownBy(() -> service.execute(DISPATCH_ID, 1, 1, otherDriver, req()))
                .isInstanceOf(SecurityException.class);
    }

    @Test
    void execute_slip_service_reject_throws_BridgeFailedException() {
        when(signatureRepo.findAllByStopIdOrderByCapturedAtDesc(STOP_ID)).thenReturn(List.of());
        Signature signature = newSignature();
        when(signatureRepo.save(any(Signature.class))).thenReturn(signature);
        when(slipClient.registerSignature(eq(SLIP_ID), any())).thenReturn(false);

        assertThatThrownBy(() -> service.execute(DISPATCH_ID, 1, 1, DRIVER_ID, req()))
                .isInstanceOf(SignAndSendCopyService.BridgeFailedException.class)
                .hasMessageContaining("SLIP_SERVICE_REJECTED");
    }
}
