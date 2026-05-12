package com.samhanair.logis.partnerauth.repository;

import com.samhanair.logis.partnerauth.domain.PartnerAuth;
import com.samhanair.logis.partnerauth.domain.PartnerStatus;
import java.util.Collection;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/** Soft-delete 필터는 entity 의 {@code @SQLRestriction} 으로 자동 적용. */
public interface PartnerAuthRepository extends JpaRepository<PartnerAuth, UUID> {

    Optional<PartnerAuth> findByBizNo(String bizNo);

    boolean existsByBizNo(String bizNo);

    /** "주문서 승인" 목록 — status filter 없이 전체. createdAt 내림차순. */
    Page<PartnerAuth> findAllByOrderByCreatedAtDesc(Pageable pageable);

    /** "주문서 승인" 목록 — internal PartnerStatus 다중 in-filter. */
    Page<PartnerAuth> findByStatusInOrderByCreatedAtDesc(
            Collection<PartnerStatus> statuses, Pageable pageable);
}
