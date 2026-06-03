package com.samhanair.logis.slip.service;

import com.samhanair.logis.slip.domain.CompensationOperation;
import com.samhanair.logis.slip.domain.CompensationPhase;
import com.samhanair.logis.slip.domain.SerialCompensationFailure;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.repository.SerialCompensationFailureRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 원격 재고 보상 실패를 구조적 WARN 로그와 slip DB 감사 행으로 남긴다.
 *
 * <p>원본 전표 트랜잭션은 inventory 실패로 롤백될 수 있으므로 반드시 별도 빈의
 * {@code REQUIRES_NEW} 메서드로 호출해 self-invocation 을 피한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class CompensationAuditWriter {

    private static final int MAX_REASON_LENGTH = 1000;

    private final SerialCompensationFailureRepository repository;
    private final CompensationAlertNotifier alertNotifier;
    private final Clock clock;

    /**
     * 보상 실패 1건을 독립 트랜잭션으로 기록한다.
     *
     * @param slip 원본 전표
     * @param phase 보상 단계
     * @param productCode 품목 코드
     * @param operation 실패한 보상 동작
     * @param compensationFailure 보상 예외
     * @param originalFailure 보상을 촉발한 원본 예외
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(Slip slip, CompensationPhase phase, String productCode,
                       CompensationOperation operation, Throwable compensationFailure,
                       Throwable originalFailure) {
        String failureReason = summarize(compensationFailure);
        String originalFailureReason = summarize(originalFailure);
        // 단일 로그라인 자급 원칙: 보상 실패 원인(cause)과 원본 실패 원인(originalCause)을 함께 기록해
        // 로그 기반 경보만으로 운영 triage 가 가능하게 한다.
        log.warn("[COMPENSATION_FAILURE] slipNo={} slipType={} phase={} product={} op={} cause={} originalCause={}",
                slip.getSlipNo(), slip.getSlipType(), phase, productCode, operation,
                failureReason, originalFailureReason);

        try {
            repository.save(SerialCompensationFailure.of(
                    slip,
                    phase,
                    productCode,
                    operation,
                    failureReason,
                    originalFailureReason,
                    LocalDateTime.now(clock)));
        } catch (RuntimeException saveFailure) {
            // 감사 행 저장마저 실패하면 suppressed 로만 묻히므로, 독립 ERROR 로그로 추적 공백을 막는다.
            log.error("[COMPENSATION_AUDIT_SAVE_FAILURE] slipNo={} phase={} product={} op={} — 감사 행 저장 실패",
                    slip.getSlipNo(), phase, productCode, operation, saveFailure);
            throw saveFailure;
        }
        // 감사 행 저장 성공 후 운영 알림 push (best-effort, 기본 비활성). 알림 실패는 보상 흐름에 무영향. (D-SER-26)
        // 원인 요약(failureReason 등)은 UUID 포함 가능 → 푸시 본문에 싣지 않으려 notifier 에 전달하지 않는다(Codex P1).
        alertNotifier.notifyFailure(slip, phase, productCode, operation);
    }

    private String summarize(Throwable ex) {
        if (ex == null) {
            return "Unknown";
        }
        String message = ex.getMessage();
        String summary = ex.getClass().getSimpleName()
                + (message == null || message.isBlank() ? "" : ": " + message);
        if (summary.length() <= MAX_REASON_LENGTH) {
            return summary;
        }
        return summary.substring(0, MAX_REASON_LENGTH);
    }
}
