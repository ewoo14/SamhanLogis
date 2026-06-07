package com.samhanair.logis.slip.service;

import com.samhanair.logis.slip.domain.SerialCompensationFailure;
import com.samhanair.logis.slip.repository.SerialCompensationFailureRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 미해소 보상 실패를 자동 재시도해 정합한다. (D-SER-27, ⑦ outbox/Saga)
 *
 * <p>오케스트레이터 — 재시도 후보 id 를 조회한 뒤 건별로 {@link CompensationRetryExecutor#retryOne}
 * (REQUIRES_NEW 독립 트랜잭션 + 행 락)에 위임한다. 클래스 전체를 단일 트랜잭션으로 묶지 않아
 * 건 사이에 DB 커넥션을 반납하고, 한 건의 실패가 다른 건에 전파되지 않게 한다(best-effort).
 *
 * <p>재시도 가능한 시리얼 보상 동작(RELEASE_INSTANCES / UNRECALL_INSTANCES)은 감사 행의
 * {@code slipNo + productCode} 만으로 inventory 호출을 재실행할 수 있다. 수량형(RELEASE/RESERVE)은
 * 식별자 부족으로 자동 재시도 대상에서 제외(skip)하고 수동 정합으로 남긴다.
 *
 * <p>운영 전제: 스케줄러는 단일 인스턴스(Phase 11 단일 EC2)에서 @Scheduled 비중첩 실행을 기본으로
 * 하며, 다중 인스턴스 동시 실행 시에도 executor 의 행 락 + inventory 멱등(#349)으로 안전하다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CompensationRetryService {

    private final SerialCompensationFailureRepository repository;
    private final CompensationRetryExecutor executor;
    private final CompensationMetrics compensationMetrics;
    private final Clock clock;

    /**
     * 재시도 후보(미해소·한도 미만·백오프 경과)를 조회해 건별 독립 트랜잭션으로 재실행한다.
     *
     * @param maxRetries 재시도 상한(이상이면 자동 재시도 중단, 수동 정합 유지)
     * @param backoffBaseMinutes 지수 백오프 기준 분(다음 시각 = now + base * 2^retryCount)
     * @return 재시도 결과 요약(후보/시도/성공/실패/스킵)
     */
    public RetryResult retryEligible(int maxRetries, long backoffBaseMinutes) {
        LocalDateTime now = LocalDateTime.now(clock);
        List<UUID> candidateIds = repository.findRetryCandidates(maxRetries, now).stream()
                .map(SerialCompensationFailure::getId)
                .toList();

        int attempted = 0;
        int succeeded = 0;
        int failed = 0;
        int skipped = 0;

        for (UUID id : candidateIds) {
            CompensationRetryExecutor.Outcome outcome = executor.retryOne(id, now, backoffBaseMinutes);
            compensationMetrics.recordRetryOutcome(outcome);
            switch (outcome) {
                case SUCCEEDED -> {
                    attempted++;
                    succeeded++;
                }
                case FAILED -> {
                    attempted++;
                    failed++;
                }
                case SKIPPED -> skipped++;
                case GONE -> { /* 조회~락 사이 해소/삭제됨 — 집계 제외 */ }
            }
        }

        log.info("[CompensationRetry] 재시도 완료 — 후보={} 시도={} 성공={} 실패={} 스킵={}",
                candidateIds.size(), attempted, succeeded, failed, skipped);
        return new RetryResult(candidateIds.size(), attempted, succeeded, failed, skipped);
    }

    /**
     * 재시도 배치 결과 요약.
     *
     * @param candidates 후보 건수
     * @param attempted 재시도 시도 건수(지원 동작)
     * @param succeeded 성공·해소 건수
     * @param failed 실패(백오프 갱신) 건수
     * @param skipped 미지원 동작 스킵 건수
     */
    public record RetryResult(int candidates, int attempted, int succeeded, int failed, int skipped) {
    }
}
