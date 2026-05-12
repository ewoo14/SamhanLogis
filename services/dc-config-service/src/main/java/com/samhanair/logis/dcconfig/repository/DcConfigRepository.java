package com.samhanair.logis.dcconfig.repository;

import com.samhanair.logis.dcconfig.domain.DcConfig;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

/** DcConfig 는 Partner 1:1 — partner_id 로 조회. */
public interface DcConfigRepository extends JpaRepository<DcConfig, UUID> {

    Optional<DcConfig> findByPartner_Id(UUID partnerId);

    Optional<DcConfig> findByPartner_PartnerCode(String partnerCode);

    /** 데스크탑 영업 "거래처 DC 설정" 화면 — partner.name / partnerCode keyword + pagination. */
    @EntityGraph(attributePaths = "partner")
    @Query("""
            SELECT dc FROM DcConfig dc
              WHERE (:keyword IS NULL
                     OR LOWER(dc.partner.name) LIKE LOWER(CONCAT('%', :keyword, '%'))
                     OR LOWER(dc.partner.partnerCode) LIKE LOWER(CONCAT('%', :keyword, '%')))
            """)
    Page<DcConfig> search(String keyword, Pageable pageable);
}
