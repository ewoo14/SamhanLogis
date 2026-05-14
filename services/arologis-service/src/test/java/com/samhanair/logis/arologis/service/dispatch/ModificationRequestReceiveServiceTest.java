package com.samhanair.logis.arologis.service.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.arologis.client.SlipDispatchTaskClient;
import com.samhanair.logis.arologis.domain.Dispatch;
import com.samhanair.logis.arologis.domain.DispatchType;
import com.samhanair.logis.arologis.dto.dispatch.ArologisCancellationRequest;
import com.samhanair.logis.arologis.dto.dispatch.ArologisModificationRequest;
import com.samhanair.logis.arologis.repository.DispatchRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * {@link ModificationRequestReceiveService} 단위 검증 — Phase C BE Task B7.
 *
 * <p>비동기 5초 sleep 은 검증하지 않고 Dispatch soft-delete 동작만 검증.
 */
@ExtendWith(MockitoExtension.class)
class ModificationRequestReceiveServiceTest {

    @Mock SlipDispatchTaskClient slipClient;
    @Mock DispatchRepository dispatchRepo;
    @InjectMocks ModificationRequestReceiveService svc;

    @Test
    void receiveModification_soft_deletes_dispatch() throws Exception {
        UUID arologisId = UUID.randomUUID();
        Dispatch dispatch = Dispatch.of(LocalDate.now(), DispatchType.DAY, "raw");
        setId(dispatch, arologisId);

        when(dispatchRepo.findById(arologisId)).thenReturn(Optional.of(dispatch));

        svc.receiveModification(arologisId,
                new ArologisModificationRequest(UUID.randomUUID(), "수정 필요"));

        // Dispatch 가 soft-delete 되어야 함
        assertThat(dispatch.getIsDeleted()).isTrue();
        verify(dispatchRepo).save(dispatch);
    }

    @Test
    void receiveCancellation_soft_deletes_dispatch() throws Exception {
        UUID arologisId = UUID.randomUUID();
        Dispatch dispatch = Dispatch.of(LocalDate.now(), DispatchType.DAY, "raw");
        setId(dispatch, arologisId);

        when(dispatchRepo.findById(arologisId)).thenReturn(Optional.of(dispatch));

        svc.receiveCancellation(arologisId,
                new ArologisCancellationRequest(UUID.randomUUID(), "취소 필요"));

        assertThat(dispatch.getIsDeleted()).isTrue();
        verify(dispatchRepo, times(1)).save(dispatch);
    }

    @Test
    void receiveModification_dispatch_not_found_is_graceful() {
        UUID arologisId = UUID.randomUUID();
        when(dispatchRepo.findById(arologisId)).thenReturn(Optional.empty());

        // throw 없이 graceful 진행
        svc.receiveModification(arologisId,
                new ArologisModificationRequest(UUID.randomUUID(), null));

        // save 호출 없음
        verify(dispatchRepo, times(0)).save(any());
    }

    private static void setId(Object entity, UUID id) throws Exception {
        Field f = entity.getClass().getDeclaredField("id");
        f.setAccessible(true);
        f.set(entity, id);
    }
}
