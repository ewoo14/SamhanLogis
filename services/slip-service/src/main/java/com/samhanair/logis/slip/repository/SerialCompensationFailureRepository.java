package com.samhanair.logis.slip.repository;

import com.samhanair.logis.slip.domain.SerialCompensationFailure;
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
}
