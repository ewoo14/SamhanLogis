package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.TaxInvoiceBatchExclusion;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * {@link TaxInvoiceBatchExclusion} JPA Repository.
 *
 * <p>Soft Delete 필터는 {@code @SQLRestriction("is_deleted = false")} 로 전역 적용.
 * active 제외 거래처 코드 기준 유일성은 DB unique partial index 로 보장.
 */
public interface TaxInvoiceBatchExclusionRepository extends JpaRepository<TaxInvoiceBatchExclusion, UUID> {

    /**
     * 전체 활성 제외 거래처 목록 조회.
     *
     * @return 제외 거래처 목록
     */
    List<TaxInvoiceBatchExclusion> findAllByOrderByCreatedAtDesc();

    /**
     * 거래처 코드로 단건 조회 (soft delete 미포함).
     *
     * @param partnerCode 거래처 코드
     * @return Optional
     */
    Optional<TaxInvoiceBatchExclusion> findByPartnerCode(String partnerCode);

    /**
     * 활성 제외 거래처 코드 목록 반환 — 변환 시 필터링에 사용.
     *
     * @return partnerCode 목록
     */
    default List<String> findAllActiveCodes() {
        return findAllByOrderByCreatedAtDesc().stream()
                .map(TaxInvoiceBatchExclusion::getPartnerCode)
                .toList();
    }
}
