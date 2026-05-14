package com.samhanair.logis.arologis.service.dispatch;

import com.samhanair.logis.arologis.client.SlipDispatchTaskClient;
import com.samhanair.logis.arologis.domain.Dispatch;
import com.samhanair.logis.arologis.dto.dispatch.ArologisCancellationRequest;
import com.samhanair.logis.arologis.dto.dispatch.ArologisModificationRequest;
import com.samhanair.logis.arologis.repository.DispatchRepository;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Samhan Public 의 수정/취소 요청을 receive 후 처리하는 service — Phase C (BE Task B7).
 *
 * <p>Phase C Mock 정책: 실제 운영은 아로로지스 관리자 UI/Phase 후속 작업으로 별도 — 본 Mock 은
 * **자동 수락 5초 비동기 회신** (배차담당자가 UI 에서 상태 변화를 관찰할 수 있도록 시간 여유).
 *
 * <p>수정 수락 시 (D-DC-04 delete-recreate 정책): arologis 측 Dispatch 를 soft-delete 한 후
 * MODIFICATION_ACCEPTED 회신. Samhan Public 배차담당자가 새 차량 그룹/슬립 매핑 작성 후
 * [배차 완료] 재 클릭 시 arologis 가 새 Dispatch 를 생성.
 *
 * <p>취소 수락 시 (D-DC-05): arologis 측 Dispatch soft-delete + CANCEL_ACCEPTED 회신.
 *
 * <p>회신은 비동기 — 본 service 의 receive 메서드는 즉시 204 반환. 5초 지연 후 background
 * thread 가 SlipDispatchTaskClient 호출.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ModificationRequestReceiveService {

    /** Mock 자동 수락 지연 (5초) — 사용자가 UI 상태 변화를 관찰할 수 있는 시간. */
    static final long MOCK_AUTO_ACCEPT_DELAY_MS = 5000L;

    private final SlipDispatchTaskClient slipClient;
    private final DispatchRepository dispatchRepo;

    /**
     * 수정 요청 receive — 즉시 Dispatch soft-delete + 5초 후 modificationAccepted 회신.
     *
     * @param arologisDispatchId arologis 측 Dispatch UUID (path)
     * @param req samhanDispatchTaskId + reason
     */
    @Transactional
    public void receiveModification(UUID arologisDispatchId, ArologisModificationRequest req) {
        log.info("[ModificationRequestReceiveService] receiveModification — arologisDispatchId={} samhanTaskId={} reason={}",
                arologisDispatchId, req.samhanDispatchTaskId(), req.reason());

        // D-DC-04: arologis 측 Dispatch soft-delete (delete-recreate 정책)
        softDeleteDispatch(arologisDispatchId, "samhan-modification-request");

        UUID samhanTaskId = req.samhanDispatchTaskId();
        CompletableFuture.runAsync(() -> {
            sleepMockDelay();
            try {
                slipClient.modificationAccepted(samhanTaskId, arologisDispatchId);
            } catch (Exception ex) {
                log.warn("[ModificationRequestReceiveService] 자동 수락 회신 실패 (Mock) — msg={}",
                        ex.getMessage());
            }
        });
    }

    /**
     * 취소 요청 receive — 즉시 Dispatch soft-delete + 5초 후 cancellationAccepted 회신.
     */
    @Transactional
    public void receiveCancellation(UUID arologisDispatchId, ArologisCancellationRequest req) {
        log.info("[ModificationRequestReceiveService] receiveCancellation — arologisDispatchId={} samhanTaskId={} reason={}",
                arologisDispatchId, req.samhanDispatchTaskId(), req.reason());

        // D-DC-05: arologis 측 Dispatch soft-delete
        softDeleteDispatch(arologisDispatchId, "samhan-cancellation-request");

        UUID samhanTaskId = req.samhanDispatchTaskId();
        CompletableFuture.runAsync(() -> {
            sleepMockDelay();
            try {
                slipClient.cancellationAccepted(samhanTaskId, arologisDispatchId);
            } catch (Exception ex) {
                log.warn("[ModificationRequestReceiveService] 자동 수락 회신 실패 (Mock) — msg={}",
                        ex.getMessage());
            }
        });
    }

    /** Dispatch soft-delete (Mock 자동 수락 정책 일관). Dispatch 가 없으면 graceful warn. */
    private void softDeleteDispatch(UUID arologisDispatchId, String actor) {
        Dispatch dispatch = dispatchRepo.findById(arologisDispatchId).orElse(null);
        if (dispatch == null) {
            log.warn("[ModificationRequestReceiveService] Dispatch 미발견 — soft-delete 스킵 arologisDispatchId={}",
                    arologisDispatchId);
            return;
        }
        dispatch.markDeleted(actor);
        dispatchRepo.save(dispatch);
    }

    private static void sleepMockDelay() {
        try {
            Thread.sleep(MOCK_AUTO_ACCEPT_DELAY_MS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
