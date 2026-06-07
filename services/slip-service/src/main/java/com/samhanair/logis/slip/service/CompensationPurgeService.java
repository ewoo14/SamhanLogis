package com.samhanair.logis.slip.service;

import com.samhanair.logis.slip.repository.SerialCompensationFailureRepository;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * soft-delete 된 보상 실패 감사 행을 grace 경과 후 물리 삭제하는 service. (D-SER-28)
 *
 * <p>2단계 purge 모델: retention 이 먼저 해소 완료 행만 soft-delete 하고, 본 service 는
 * {@code is_deleted=true AND deleted_at < cutoff} native DELETE 로 grace 경과 행만 hard-delete 한다.
 * native DELETE 는 {@code @SQLRestriction} 을 적용받지 않으므로 repository 쿼리의
 * {@code is_deleted=true} 조건이 활성 행 불가침 가드다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CompensationPurgeService {

    private final SerialCompensationFailureRepository failureRepository;
    private final CompensationMetrics compensationMetrics;

    /**
     * soft-delete 후 grace 가 지난 감사 행을 단일 배치로 물리 삭제한다.
     *
     * <p>한 번의 cron 발화는 한 번의 DELETE batch 만 수행한다. 장시간 트랜잭션과 운영 DB 부하를
     * 피하고, 남은 행은 다음 발화에서 이어 처리하기 위한 의도적 단순화다.
     *
     * <p>{@code @Modifying(clearAutomatically=true)} 는 사용하지 않는다. 본 메서드는 전용
     * 트랜잭션에서 native DELETE 만 실행하고 같은 영속성 컨텍스트에서 다른 엔티티 작업을 공유하지
     * 않으므로 1차 캐시 정리가 필요 없다.
     *
     * @param cutoff 물리 삭제 기준 시각
     * @param batchSize 단일 배치 최대 삭제 건수
     * @return 물리 삭제 건수
     */
    @Transactional
    public int purgePhysically(LocalDateTime cutoff, int batchSize) {
        int purged = failureRepository.deleteSoftDeletedBefore(cutoff, batchSize);
        compensationMetrics.recordRetentionPurgedHard(purged);
        log.info("[CompensationPurge] 보상 실패 감사 물리 purge 완료 — cutoff={}, batchSize={}, count={}",
                cutoff, batchSize, purged);
        return purged;
    }
}
