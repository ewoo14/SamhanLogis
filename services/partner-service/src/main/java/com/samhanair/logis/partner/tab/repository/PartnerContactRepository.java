package com.samhanair.logis.partner.tab.repository;

import com.samhanair.logis.partner.domain.PartnerContact;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/**
 * 거래처 담당자 저장소.
 *
 * <p>{@link com.samhanair.logis.partner.domain.PartnerContact#getIsPrimary()} 갱신 시
 * 동일 트랜잭션에서 {@link #clearPrimaryByPartnerId(UUID)} 로 이전 주 담당자를 FALSE 처리.
 */
@Repository
public interface PartnerContactRepository extends JpaRepository<PartnerContact, UUID> {

    /**
     * 거래처 UUID 로 담당자 목록 조회 (is_deleted = false 자동 필터).
     *
     * @param partnerId 거래처 UUID
     * @return 활성 담당자 목록
     */
    List<PartnerContact> findAllByPartnerId(UUID partnerId);

    /**
     * 거래처의 모든 활성 담당자 중 주 담당자(is_primary = TRUE)를 FALSE 로 일괄 갱신.
     *
     * <p>새 주 담당자 지정 전 service 레이어가 호출. @SQLRestriction 이 쿼리에 자동 포함.
     *
     * @param partnerId 거래처 UUID
     */
    @Modifying
    @Query("UPDATE PartnerContact c SET c.isPrimary = FALSE WHERE c.partnerId = :partnerId AND c.isPrimary = TRUE")
    void clearPrimaryByPartnerId(@Param("partnerId") UUID partnerId);

    /**
     * 주 담당자 단건 조회.
     *
     * @param partnerId 거래처 UUID
     * @return 주 담당자 (미설정 시 empty)
     */
    Optional<PartnerContact> findByPartnerIdAndIsPrimaryTrue(UUID partnerId);
}
