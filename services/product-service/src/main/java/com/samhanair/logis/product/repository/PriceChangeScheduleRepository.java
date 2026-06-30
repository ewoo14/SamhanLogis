package com.samhanair.logis.product.repository;

import com.samhanair.logis.product.domain.PriceChangeSchedule;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 단가변동 카테고리별 적용일 repository. */
public interface PriceChangeScheduleRepository extends JpaRepository<PriceChangeSchedule, UUID> {

    /** 활성 스케줄 전체를 category 오름차순으로 조회한다. (@SQLRestriction 이 soft-delete 게이트 담당) */
    List<PriceChangeSchedule> findAllByOrderByCategoryAsc();

    /** categoryKey 기준 활성 스케줄을 조회한다. (@SQLRestriction 이 soft-delete 게이트 담당) */
    Optional<PriceChangeSchedule> findByCategory(String category);
}
