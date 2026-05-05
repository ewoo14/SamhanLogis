package com.samhanair.logis.dcconfig.repository;

import com.samhanair.logis.dcconfig.domain.DcConfig;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** DcConfig 는 Partner 1:1 — partner_id 로 조회. */
public interface DcConfigRepository extends JpaRepository<DcConfig, UUID> {

    Optional<DcConfig> findByPartner_Id(UUID partnerId);

    Optional<DcConfig> findByPartner_PartnerCode(String partnerCode);
}
