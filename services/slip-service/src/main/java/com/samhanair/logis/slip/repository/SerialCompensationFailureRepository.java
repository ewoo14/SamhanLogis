package com.samhanair.logis.slip.repository;

import com.samhanair.logis.slip.domain.SerialCompensationFailure;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 원격 재고 보상 실패 감사 저장소.
 */
public interface SerialCompensationFailureRepository
        extends JpaRepository<SerialCompensationFailure, UUID> {

    /**
     * 해소 여부별 보상 실패 감사 행을 최신 생성 순으로 조회한다.
     *
     * @param resolved 해소 여부
     * @param pageable 페이지 요청
     * @return 생성시각 내림차순 보상 실패 page
     */
    Page<SerialCompensationFailure> findByResolvedOrderByCreatedAtDesc(
            boolean resolved,
            Pageable pageable);

    /**
     * 보존기간이 지난 해소 완료 감사 행을 조회한다.
     *
     * <p>{@code @SQLRestriction("is_deleted = false")} 로 이미 정리된 행은 재조회되지 않아
     * retention 작업이 멱등으로 동작한다.
     *
     * @param cutoff 보존기간 기준 시각. 이 시각보다 오래된 행만 후보
     * @return 정리 후보 감사 행 목록
     */
    List<SerialCompensationFailure> findByResolvedTrueAndCreatedAtBefore(
            LocalDateTime cutoff);
}
