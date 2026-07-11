package com.samhanair.logis.arologis.realtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.arologis.domain.Dispatch;
import com.samhanair.logis.arologis.domain.StopStatus;
import com.samhanair.logis.arologis.domain.Vehicle;
import com.samhanair.logis.arologis.domain.VehicleStop;
import com.samhanair.logis.arologis.realtime.domain.ArologisEditRequest;
import com.samhanair.logis.arologis.realtime.repository.ArologisEditRequestRepository;
import com.samhanair.logis.arologis.realtime.service.ArologisEditRequestService;
import com.samhanair.logis.arologis.repository.DispatchRepository;
import com.samhanair.logis.arologis.repository.VehicleRepository;
import com.samhanair.logis.arologis.repository.VehicleStopRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import com.samhanair.logis.shared.realtime.editrequest.EditRequestStatus;
import com.samhanair.logis.shared.realtime.editrequest.EditRequestType;
import com.samhanair.logis.shared.realtime.editrequest.EditTargetRole;
import com.samhanair.logis.shared.realtime.lock.DefaultEditLockGuard;
import com.samhanair.logis.shared.realtime.lock.EditLockGuard;
import com.samhanair.logis.shared.realtime.lock.LockedException;
import java.lang.reflect.Field;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * PR-H4b — ArologisEditRequestService 단위 테스트.
 */
@ExtendWith(MockitoExtension.class)
class ArologisEditRequestServiceTest {

    @Mock
    private ArologisEditRequestRepository requestRepository;

    @Mock
    private DispatchRepository dispatchRepository;

    @Mock
    private VehicleRepository vehicleRepository;

    @Mock
    private VehicleStopRepository stopRepository;

    @Mock
    private RealtimeBroker broker;

    private final EditLockGuard editLockGuard = new DefaultEditLockGuard();

    private ArologisEditRequestService service;

    private UUID dispatchId;
    private UUID vehicleId;
    private UUID requesterId;

    @BeforeEach
    void setUp() {
        service = new ArologisEditRequestService(requestRepository, dispatchRepository,
                vehicleRepository, stopRepository, broker, editLockGuard);
        dispatchId = UUID.randomUUID();
        vehicleId = UUID.randomUUID();
        requesterId = UUID.randomUUID();
        lenient().when(requestRepository.save(any(ArologisEditRequest.class)))
                .thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void request_dispatchedDispatch_createsPendingRequest() {
        Dispatch dispatch = stubDispatch();
        when(dispatchRepository.findById(dispatchId)).thenReturn(Optional.of(dispatch));
        when(vehicleRepository.findAllByDispatchIdOrderBySequenceAsc(dispatchId))
                .thenReturn(List.of(stubVehicle()));
        when(stopRepository.findAllByVehicleIdOrderBySequenceAsc(vehicleId))
                .thenReturn(List.of(stubStop(StopStatus.ARRIVED)));

        ArologisEditRequest result = service.request(dispatchId, EditRequestType.EDIT,
                "사후 정정", requesterId, "배차담당");

        assertThat(result.getStatus()).isEqualTo(EditRequestStatus.PENDING);
        assertThat(result.getEntityId()).isEqualTo(dispatchId);
        assertThat(result.getTargetRole()).isEqualTo(EditTargetRole.MANAGER);
        verify(broker).publish(eq(dispatchId),
                eq(ArologisEditRequestService.EVENT_REQUEST_CREATED), any());
    }

    @Test
    void request_plannedDispatch_throwsInvalidInput() {
        Dispatch dispatch = stubDispatch();
        when(dispatchRepository.findById(dispatchId)).thenReturn(Optional.of(dispatch));
        when(vehicleRepository.findAllByDispatchIdOrderBySequenceAsc(dispatchId))
                .thenReturn(List.of(stubVehicle()));
        when(stopRepository.findAllByVehicleIdOrderBySequenceAsc(vehicleId))
                .thenReturn(List.of(stubStop(StopStatus.PENDING)));

        assertThatThrownBy(() -> service.request(dispatchId, EditRequestType.EDIT, null,
                requesterId, "x"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("배송 전")
                .hasMessageNotContaining("PLANNED");
        verify(broker, never()).publish(any(), anyString(), any());
    }

    @Test
    void request_dispatchNotFound_throwsNotFound() {
        when(dispatchRepository.findById(dispatchId)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.request(dispatchId, EditRequestType.EDIT, null,
                requesterId, "x"))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void approve_pendingRequest_transitionsToApproved() {
        UUID requestId = UUID.randomUUID();
        ArologisEditRequest request = ArologisEditRequest.create(dispatchId, requesterId, "요청자",
                EditRequestType.EDIT, null, EditTargetRole.MANAGER, null);
        when(requestRepository.findByIdForDecision(requestId)).thenReturn(Optional.of(request));

        ArologisEditRequest approved = service.approve(requestId, UUID.randomUUID(), "관리자", null);
        assertThat(approved.getStatus()).isEqualTo(EditRequestStatus.APPROVED);
    }

    @Test
    void approve_throwsConflict_andSkipsPublish_whenAlreadyDecided() {
        UUID requestId = UUID.randomUUID();
        ArologisEditRequest request = ArologisEditRequest.create(dispatchId, requesterId, "요청자",
                EditRequestType.EDIT, null, EditTargetRole.MANAGER, null);
        request.approve(UUID.randomUUID(), "관리자A", null);
        when(requestRepository.findByIdForDecision(requestId)).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> service.approve(requestId, UUID.randomUUID(), "관리자B", null))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONFLICT);
        verify(broker, never()).publish(eq(dispatchId),
                eq(ArologisEditRequestService.EVENT_REQUEST_DECIDED), any());
    }

    @Test
    void reject_throwsConflict_andSkipsPublish_whenAlreadyDecided() {
        UUID requestId = UUID.randomUUID();
        ArologisEditRequest request = ArologisEditRequest.create(dispatchId, requesterId, "요청자",
                EditRequestType.DELETE, "삭제", EditTargetRole.MANAGER, null);
        request.approve(UUID.randomUUID(), "관리자A", null);
        when(requestRepository.findByIdForDecision(requestId)).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> service.reject(requestId, UUID.randomUUID(), "관리자B", "불가"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONFLICT);
        verify(broker, never()).publish(eq(dispatchId),
                eq(ArologisEditRequestService.EVENT_REQUEST_DECIDED), any());
    }

    @Test
    void consumeApproval_throwsConflict_whenAlreadyConsumed() {
        UUID requestId = UUID.randomUUID();
        ArologisEditRequest request = ArologisEditRequest.create(dispatchId, requesterId, "요청자",
                EditRequestType.EDIT, null, EditTargetRole.MANAGER, null);
        request.approve(UUID.randomUUID(), "관리자A", null);
        request.consumeApproval("user-1");
        when(requestRepository.findByIdForDecision(requestId)).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> service.consumeApproval(requestId, "system"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONFLICT);
    }

    @Test
    void guardCanEdit_dispatchedWithoutApproval_throws() {
        Dispatch dispatch = stubDispatch();
        when(vehicleRepository.findAllByDispatchIdOrderBySequenceAsc(dispatchId))
                .thenReturn(List.of(stubVehicle()));
        when(stopRepository.findAllByVehicleIdOrderBySequenceAsc(vehicleId))
                .thenReturn(List.of(stubStop(StopStatus.DELIVERED)));
        when(requestRepository.findFirstByEntityIdAndStatus(dispatchId, EditRequestStatus.APPROVED))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.guardCanEdit(dispatch))
                .isInstanceOf(LockedException.class);
    }

    @Test
    void guardCanEdit_dispatchedWithApproval_passes() {
        Dispatch dispatch = stubDispatch();
        when(vehicleRepository.findAllByDispatchIdOrderBySequenceAsc(dispatchId))
                .thenReturn(List.of(stubVehicle()));
        when(stopRepository.findAllByVehicleIdOrderBySequenceAsc(vehicleId))
                .thenReturn(List.of(stubStop(StopStatus.ARRIVED)));
        ArologisEditRequest approved = ArologisEditRequest.create(dispatchId, requesterId, "x",
                EditRequestType.EDIT, null, EditTargetRole.MANAGER, null);
        approved.approve(UUID.randomUUID(), "관리자", null);
        when(requestRepository.findFirstByEntityIdAndStatus(dispatchId, EditRequestStatus.APPROVED))
                .thenReturn(Optional.of(approved));

        // no throw
        service.guardCanEdit(dispatch);
    }

    private Dispatch stubDispatch() {
        try {
            java.lang.reflect.Constructor<Dispatch> ctor = Dispatch.class.getDeclaredConstructor();
            ctor.setAccessible(true);
            Dispatch d = ctor.newInstance();
            setField(d, "id", dispatchId);
            return d;
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private Vehicle stubVehicle() {
        try {
            java.lang.reflect.Constructor<Vehicle> ctor = Vehicle.class.getDeclaredConstructor();
            ctor.setAccessible(true);
            Vehicle v = ctor.newInstance();
            setField(v, "id", vehicleId);
            return v;
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private VehicleStop stubStop(StopStatus status) {
        try {
            java.lang.reflect.Constructor<VehicleStop> ctor = VehicleStop.class.getDeclaredConstructor();
            ctor.setAccessible(true);
            VehicleStop s = ctor.newInstance();
            setField(s, "status", status);
            setField(s, "id", UUID.randomUUID());
            return s;
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private static void setField(Object target, String name, Object value) {
        try {
            Field f = findField(target.getClass(), name);
            f.setAccessible(true);
            f.set(target, value);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private static Field findField(Class<?> clazz, String name) throws NoSuchFieldException {
        Class<?> cur = clazz;
        while (cur != null) {
            try {
                return cur.getDeclaredField(name);
            } catch (NoSuchFieldException ignored) {
                cur = cur.getSuperclass();
            }
        }
        throw new NoSuchFieldException(name);
    }
}
