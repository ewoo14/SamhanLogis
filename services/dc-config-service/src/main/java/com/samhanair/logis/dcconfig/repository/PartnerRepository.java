package com.samhanair.logis.dcconfig.repository;

import com.samhanair.logis.dcconfig.domain.Partner;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** Soft-delete 는 entity 레벨 @SQLRestriction 으로 강제. */
public interface PartnerRepository extends JpaRepository<Partner, UUID> {

    Optional<Partner> findByPartnerCode(String partnerCode);

    Optional<Partner> findByBizNo(String bizNo);

    boolean existsByPartnerCodeAndIsDeletedFalse(String partnerCode);
}
