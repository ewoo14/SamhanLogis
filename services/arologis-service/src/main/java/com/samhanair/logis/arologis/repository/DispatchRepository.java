package com.samhanair.logis.arologis.repository;

import com.samhanair.logis.arologis.domain.Dispatch;
import com.samhanair.logis.arologis.domain.DispatchType;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/**
 * Dispatch 저장소 — 날짜 / 유형 조회.
 */
@Repository
public interface DispatchRepository extends JpaRepository<Dispatch, UUID> {

    List<Dispatch> findAllByDispatchDateOrderByCreatedAtDesc(LocalDate dispatchDate);

    List<Dispatch> findAllByDispatchDateAndDispatchTypeOrderByCreatedAtDesc(
            LocalDate dispatchDate, DispatchType dispatchType);

    Optional<Dispatch> findBySamhanDispatchTaskIdAndIsDeletedFalse(UUID samhanDispatchTaskId);

    /**
     * 기간 내 모든 dispatch 조회 — Phase 10 PR-F1 BE-2 (운송사 실배차 비교).
     *
     * <p>legacy GAS 11번 ("운송사-실배차내역 비교") 의 from/to 자동 조회 source.
     * dispatchDate 인덱스 활용 (V1 migration ix_dispatches_date).
     *
     * @param fromDate 조회 시작일 (inclusive)
     * @param toDate   조회 종료일 (inclusive)
     * @return 활성 dispatch 목록 (날짜 오름차순)
     */
    List<Dispatch> findAllByDispatchDateBetweenOrderByDispatchDateAsc(
            LocalDate fromDate, LocalDate toDate);
}
