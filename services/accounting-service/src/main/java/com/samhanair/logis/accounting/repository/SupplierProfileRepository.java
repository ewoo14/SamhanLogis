package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.SupplierProfile;
import com.samhanair.logis.accounting.repository.projection.SupplierProfileSummary;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

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

    /**
     * 전체 사업자 프로필 목록 — stamp_png BYTEA 컬럼 제외 프로젝션.
     *
     * <p>P3-1: {@code listAll()} 호출 시 stamp_png BYTEA 전체를 Hibernate 가
     * hydrate 하지 않도록 {@link SupplierProfileSummary} 인터페이스 프로젝션 사용.
     * stamp 관련 필드는 {@link #findById} 상세 조회 경로에서만 로드된다.
     *
     * @return stamp 미포함 요약 프로젝션 목록
     */
    @Query("""
            SELECT s.id              AS id,
                   s.businessNumber  AS businessNumber,
                   s.subBusinessNumber AS subBusinessNumber,
                   s.companyName     AS companyName,
                   s.representativeName AS representativeName,
                   s.businessAddress AS businessAddress,
                   s.businessType    AS businessType,
                   s.businessItem    AS businessItem,
                   s.email           AS email,
                   s.tel             AS tel,
                   s.fax             AS fax,
                   s.isPrimary       AS isPrimary,
                   s.version         AS version,
                   s.stampHash       AS stampHash,
                   s.logoHash        AS logoHash
            FROM SupplierProfile s
            WHERE s.isDeleted = false
            ORDER BY s.isPrimary DESC, s.createdAt ASC
            """)
    List<SupplierProfileSummary> findAllSummary();

    /**
     * replace-all 동시성 보호용 비관적 쓰기 락 단건 조회.
     *
     * <p>P3-2: 계좌 replace-all 경로에서 두 개 이상의 요청이 동시에 같은 프로필에
     * {@code PUT /{id}} 를 보낼 경우 기존 계좌 Soft Delete + 신규 insert 두 단계 사이에
     * 중복 활성 계좌가 발생할 수 있다.
     * {@link jakarta.persistence.LockModeType#PESSIMISTIC_WRITE} 로 row 를 잠금하여
     * 동시 interleave 를 방지한다.
     *
     * @param id 사업자 프로필 UUID
     * @return Optional (락 획득된 엔티티)
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM SupplierProfile s WHERE s.id = :id AND s.isDeleted = false")
    Optional<SupplierProfile> findByIdForUpdate(@Param("id") UUID id);
}
