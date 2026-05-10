package com.samhanair.logis.partner.tab.repository;

import com.samhanair.logis.partner.domain.PartnerShippingAddress;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/**
 * 거래처 배송지 저장소.
 *
 * <p>{@link com.samhanair.logis.partner.domain.PartnerShippingAddress#getIsDefault()} 갱신 시
 * 동일 트랜잭션에서 {@link #clearDefaultByPartnerId(UUID)} 로 이전 기본 배송지를 FALSE 처리.
 */
@Repository
public interface PartnerShippingAddressRepository
        extends JpaRepository<PartnerShippingAddress, UUID> {

    /**
     * 거래처 UUID 로 배송지 목록 조회 (is_deleted = false 자동 필터).
     *
     * @param partnerId 거래처 UUID
     * @return 활성 배송지 목록
     */
    List<PartnerShippingAddress> findAllByPartnerId(UUID partnerId);

    /**
     * 거래처의 모든 활성 배송지 중 기본 배송지(is_default = TRUE)를 FALSE 로 일괄 갱신.
     *
     * <p>새 기본 배송지 지정 전 service 레이어가 호출. @SQLRestriction 이 쿼리에 자동 포함.
     *
     * @param partnerId 거래처 UUID
     */
    @Modifying
    @Query("UPDATE PartnerShippingAddress a SET a.isDefault = FALSE WHERE a.partnerId = :partnerId AND a.isDefault = TRUE")
    void clearDefaultByPartnerId(@Param("partnerId") UUID partnerId);

    /**
     * 기본 배송지 단건 조회.
     *
     * @param partnerId 거래처 UUID
     * @return 기본 배송지 (미설정 시 empty)
     */
    Optional<PartnerShippingAddress> findByPartnerIdAndIsDefaultTrue(UUID partnerId);
}
