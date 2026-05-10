package com.samhanair.logis.partner.tab.repository;

import com.samhanair.logis.partner.domain.PartnerPriceDiscount;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/**
 * 거래처 단가/할인 정책 저장소.
 *
 * <p>거래처당 1행 (UNIQUE partner_id) — {@link #findByPartnerId} 로 존재 여부 판단 후
 * UPSERT 패턴 적용 (service 레이어 책임).
 */
@Repository
public interface PartnerPriceDiscountRepository extends JpaRepository<PartnerPriceDiscount, UUID> {

    /**
     * 거래처 UUID 로 단가/할인 정책 단건 조회.
     *
     * @param partnerId 거래처 UUID
     * @return 존재 시 PartnerPriceDiscount, 미존재 시 empty
     */
    Optional<PartnerPriceDiscount> findByPartnerId(UUID partnerId);
}
