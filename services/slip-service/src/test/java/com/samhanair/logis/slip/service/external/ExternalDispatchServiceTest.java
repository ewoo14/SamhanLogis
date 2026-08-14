package com.samhanair.logis.slip.service.external;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.shared.realtime.collection.CollectionRealtimePublisher;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.domain.dispatch.SlipDispatchStatus;
import com.samhanair.logis.slip.domain.external.ExternalCarrier;
import com.samhanair.logis.slip.domain.external.ExternalDispatch;
import com.samhanair.logis.slip.domain.external.ExternalDispatchChannel;
import com.samhanair.logis.slip.dto.external.CreateExternalDispatchRequest;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.repository.external.ExternalCarrierRepository;
import com.samhanair.logis.slip.repository.external.ExternalDispatchRepository;
import com.samhanair.logis.slip.repository.external.ExternalDispatchSlipRepository;
import com.samhanair.logis.slip.realtime.DispatchBoardRealtime;
import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** 타배송사 발송 성공 경로가 배차 보드 live sync 를 발화하는지 검증한다. */
@ExtendWith(MockitoExtension.class)
class ExternalDispatchServiceTest {

    private static final String USER_ID = "10000000-0000-0000-0000-000000000321";

    @Mock ExternalCarrierRepository externalCarrierRepository;
    @Mock ExternalDispatchRepository externalDispatchRepository;
    @Mock ExternalDispatchSlipRepository externalDispatchSlipRepository;
    @Mock SlipRepository slipRepository;
    @Mock ExternalDispatchSmsComposer smsComposer;
    @Mock NotificationClient notificationClient;
    @Mock CollectionRealtimePublisher collectionPublisher;

    @Test
    void dispatch_print_success_marks_slip_dispatched_and_publishes_board_status_changed() throws Exception {
        UUID carrierId = UUID.randomUUID();
        UUID slipId = UUID.randomUUID();
        UUID sentBy = UUID.randomUUID();
        ExternalCarrier carrier = ExternalCarrier.create("인쇄퀵", "010-7000-0101", null, null, null);
        setId(carrier, carrierId);
        Slip slip = dispatchReadySlip("2026/07/02-EXT-001", 901);
        setId(slip, slipId);

        when(externalCarrierRepository.findById(carrierId)).thenReturn(Optional.of(carrier));
        when(slipRepository.findAllByIdInAndIsDeletedFalseForExternalDispatchUpdate(List.of(slipId)))
                .thenReturn(List.of(slip));
        when(externalDispatchRepository.saveAndFlush(any(ExternalDispatch.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        ExternalDispatchService service = new ExternalDispatchService(
                externalCarrierRepository,
                externalDispatchRepository,
                externalDispatchSlipRepository,
                slipRepository,
                smsComposer,
                notificationClient,
                collectionPublisher);

        service.dispatch(new CreateExternalDispatchRequest(
                carrierId, List.of(slipId), ExternalDispatchChannel.PRINT), sentBy);

        assertThat(slip.getDispatchStatus()).isEqualTo(SlipDispatchStatus.DISPATCHED);
        verify(collectionPublisher).publishChange(
                eq(DispatchBoardRealtime.CHANNEL_ID),
                eq(DispatchBoardRealtime.EVENT_CHANGED),
                argThat(payload -> hasChangeType(payload, "STATUS_CHANGED")));
    }

    @Test
    void dispatch_sms_failure_marks_dispatch_failed_and_does_not_publish_board_change() throws Exception {
        UUID carrierId = UUID.randomUUID();
        UUID slipId = UUID.randomUUID();
        UUID sentBy = UUID.randomUUID();
        ExternalCarrier carrier = ExternalCarrier.create("SMS 기사", "010-7000-0202", null, null, null);
        setId(carrier, carrierId);
        Slip slip = dispatchReadySlip("2026/07/02-EXT-FAIL", 902);
        setId(slip, slipId);

        when(externalCarrierRepository.findById(carrierId)).thenReturn(Optional.of(carrier));
        when(slipRepository.findAllByIdInAndIsDeletedFalseForExternalDispatchUpdate(List.of(slipId)))
                .thenReturn(List.of(slip));
        when(notificationClient.sendExternalSmsWithResult(any(), any(), any())).thenReturn(false);
        when(externalDispatchRepository.saveAndFlush(any(ExternalDispatch.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        ExternalDispatchService service = new ExternalDispatchService(
                externalCarrierRepository,
                externalDispatchRepository,
                externalDispatchSlipRepository,
                slipRepository,
                smsComposer,
                notificationClient,
                collectionPublisher);

        service.dispatch(new CreateExternalDispatchRequest(
                carrierId, List.of(slipId), ExternalDispatchChannel.SMS), sentBy);

        assertThat(slip.getDispatchStatus()).isEqualTo(SlipDispatchStatus.UNDISPATCHED);
        verify(collectionPublisher, never()).publishChange(any(), any(), any());
    }

    private static Slip dispatchReadySlip(String slipNo, int seqNo) {
        Slip slip = Slip.createOutbound(
                slipNo,
                LocalDate.of(2026, 7, 2),
                seqNo,
                UUID.randomUUID(),
                null,
                UUID.randomUUID(),
                "타배송사 거래처 " + seqNo,
                DeliveryTag.SALE,
                "external dispatch unit",
                USER_ID);
        slip.setPartnerCode("EDS-" + seqNo);
        slip.withProjectInfo(null, "서울시 강남구 테스트로 " + seqNo, null, null,
                "010-1000-" + seqNo, null);
        slip.addLine(SlipLine.create(slip, UUID.randomUUID(), "무풍 실내기", "AJ040",
                null, 2, BigDecimal.ZERO, null));
        slip.save();
        slip.send();
        slip.accept(USER_ID);
        slip.process();
        slip.complete();
        slip.inspect(USER_ID);
        return slip;
    }

    private static void setId(Object entity, UUID id) throws Exception {
        Field f = entity.getClass().getDeclaredField("id");
        f.setAccessible(true);
        f.set(entity, id);
    }

    private static boolean hasChangeType(Map<String, Object> payload, String expected) {
        return expected.equals(payload.get("changeType"));
    }
}
