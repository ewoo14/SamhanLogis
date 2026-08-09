package com.samhanair.logis.dcconfig.repository;

import com.samhanair.logis.dcconfig.domain.DcConfig;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** DcConfig 는 Partner 1:1 — partner_id 로 조회. */
public interface DcConfigRepository extends JpaRepository<DcConfig, UUID> {

    Optional<DcConfig> findByPartner_Id(UUID partnerId);

    @EntityGraph(attributePaths = "partner")
    Optional<DcConfig> findByPartner_PartnerCode(String partnerCode);

    /**
     * 외부 단건 응답용 거래처 동시 조회.
     * 서비스 트랜잭션이 끝난 뒤 DTO가 partnerCode/companyName을 읽어도
     * LazyInitializationException이 발생하지 않도록 JOIN FETCH를 계약으로 고정한다.
     */
    @Query("""
            SELECT dc FROM DcConfig dc
              JOIN FETCH dc.partner p
             WHERE p.partnerCode = :partnerCode
            """)
    Optional<DcConfig> findWithPartnerByPartnerCode(@Param("partnerCode") String partnerCode);

    /** 데스크탑 영업 "거래처 DC 설정" 화면 — partner.name / partnerCode keyword + pagination. */
    @EntityGraph(attributePaths = "partner")
    @Query("""
            SELECT dc FROM DcConfig dc
              WHERE (CAST(:keyword AS string) IS NULL
                     OR LOWER(dc.partner.name) LIKE LOWER(CONCAT('%', CAST(:keyword AS string), '%')) ESCAPE '\\'
                     OR LOWER(dc.partner.partnerCode) LIKE LOWER(CONCAT('%', CAST(:keyword AS string), '%')) ESCAPE '\\')
            """)
    Page<DcConfig> search(String keyword, Pageable pageable);

    /** #31 — estimate-app 벌크 prefetch (legacy getAllNotionDcConfigs_ 대체). partner fetch join. */
    @EntityGraph(attributePaths = "partner")
    @Query("SELECT dc FROM DcConfig dc")
    java.util.List<DcConfig> findAllWithPartner();
}
