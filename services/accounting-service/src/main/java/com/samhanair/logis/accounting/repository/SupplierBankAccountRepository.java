package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.SupplierBankAccount;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 공급자 은행계좌 레포지토리.
 *
 * <p>{@code @SQLRestriction("is_deleted = false")} 가 {@link SupplierBankAccount} 에 선언되어
 * 있으므로 모든 쿼리는 자동으로 Soft Delete 미삭제 row 만 조회한다.
 *
 * <p>계좌 목록은 {@code displayOrder} 오름차순으로 정렬되어 반환된다.
 */
public interface SupplierBankAccountRepository extends JpaRepository<SupplierBankAccount, UUID> {

    /**
     * 특정 사업자 프로필의 활성 계좌 목록 조회 (표시 순서 오름차순).
     *
     * @param supplierProfileId 사업자 프로필 UUID
     * @return 활성 계좌 목록 (displayOrder 오름차순)
     */
    List<SupplierBankAccount> findBySupplierProfileIdOrderByDisplayOrderAsc(UUID supplierProfileId);
}
