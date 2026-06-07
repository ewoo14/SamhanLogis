package com.samhanair.logis.slip.service;

import com.samhanair.logis.slip.domain.SerialCompensationFailure;
import com.samhanair.logis.slip.repository.SerialCompensationFailureRepository;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 해소 완료된 보상 실패 감사 행의 보존기간 만료 정리 service.
 *
 * <p>미해소({@code resolved=false}) 행은 재고 정합 복구 단서이므로 절대 정리하지 않는다.
 * 저장소 조회 조건을 {@code resolved=true AND created_at < cutoff} 로 제한하고, 실제 변경은
 * {@link SerialCompensationFailure#softDelete(String)} 도메인 메서드에 위임한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CompensationRetentionService {

    private final SerialCompensationFailureRepository failureRepository;
    private final CompensationMetrics compensationMetrics;

    /**
     * 보존기간 기준 시각보다 오래된 해소 완료 감사 행을 soft-delete 한다.
     *
     * @param cutoff 보존기간 기준 시각
     * @param actor 정리 수행자 식별자
     * @return soft-delete 처리 건수
     */
    @Transactional
    public int purge(LocalDateTime cutoff, String actor) {
        List<SerialCompensationFailure> candidates =
                failureRepository.findByResolvedTrueAndCreatedAtBefore(cutoff);
        if (candidates.isEmpty()) {
            return 0;
        }
        String deleter = actor == null || actor.isBlank() ? "system-retention" : actor;
        for (SerialCompensationFailure failure : candidates) {
            failure.softDelete(deleter);
        }
        compensationMetrics.recordRetentionPurgedSoft(candidates.size());
        log.info("[CompensationRetention] 보상 실패 감사 retention 정리 완료 — cutoff={}, count={}",
                cutoff, candidates.size());
        return candidates.size();
    }
}
