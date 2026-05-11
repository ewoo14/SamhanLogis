package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.SupplierProfile;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 사업자 프로필 레포지토리.
 *
 * <p>{@code @SQLRestriction("is_deleted = false")} 가 {@link SupplierProfile} 에 선언되어 있으므로
 * 모든 쿼리는 자동으로 Soft Delete 미삭제 row 만 조회한다.
 */
public interface SupplierProfileRepository extends JpaRepository<SupplierProfile, UUID> {

    /**
     * 기본 사업자(isPrimary=true, is_deleted=false) 단건 조회.
     *
     * <p>DB 부분 유니크 인덱스({@code uq_supplier_primary_active})로 항상 0 또는 1건 보장.
     * {@link com.samhanair.logis.accounting.service.TaxInvoiceBatchService} 가
     * 홈택스 양식 변환 시 1회 호출하여 공급자 정보를 가져온다.
     *
     * @return 기본 사업자 Optional
     */
    Optional<SupplierProfile> findByIsPrimaryTrueAndIsDeletedFalse();

    /**
     * 사업자등록번호로 단건 조회 (active row).
     *
     * <p>신규 등록 시 중복 체크 용도.
     *
     * @param businessNumber 사업자등록번호 (10자리)
     * @return 조회 결과 Optional
     */
    Optional<SupplierProfile> findByBusinessNumber(String businessNumber);
}
