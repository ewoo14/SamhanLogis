package com.samhanair.logis.partnerorder.repository;

import com.samhanair.logis.partnerorder.outbox.SlipPublishOutbox;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/**
 * Outbox row 조회 + 짧은 원자 claim.
 *
 * <p>정상 claim(PENDING/stale PROCESSING → PROCESSING)은 {@link SlipPublishOutboxRepositoryCustom}
 * 의 네이티브 {@code UPDATE ... RETURNING}(FOR UPDATE SKIP LOCKED)이 담당한다. 본 인터페이스는
 * 결과 tx 의 소유권 재검증용 비관 락 조회만 추가로 노출한다.
 */
@Repository
public interface SlipPublishOutboxRepository extends JpaRepository<SlipPublishOutbox, UUID>,
        SlipPublishOutboxRepositoryCustom {

    /**
     * 결과 tx 소유권 가드용 비관적 쓰기 락 조회.
     *
     * <p>결과 writer(commitSuccess/handleRetry/requeueAfterResultFailure)가 row 를
     * {@code SELECT ... FOR UPDATE} 로 잠근 뒤 현재 상태가 PROCESSING 인지 재검한다. lease 만료로
     * 동일 row 를 두 worker 가 겹쳐 처리(A=성공→COMMITTED, B=stale 실패→PENDING)하더라도 per-row
     * 직렬화로 먼저 락을 획득한 전이만 적용되고, 뒤늦은 전이는 non-PROCESSING 을 보고 skip 되어
     * COMMITTED 가 PENDING 으로 덮이는 clobber 를 원천 차단한다. 단일 row(PK) 락이라 데드락은 없다.
     *
     * <p>락은 호출 tx 종료까지만 유지되며, HTTP 발행은 tx 밖(processor)에서 수행하므로 락을 물지 않는다.
     *
     * @param id outbox row PK
     * @return PROCESSING 여부 재검 대상 row (없으면 empty)
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from SlipPublishOutbox o where o.id = :id")
    Optional<SlipPublishOutbox> findWithLockById(@Param("id") UUID id);
}
