package com.samhanair.logis.slip.repository.external;

import com.samhanair.logis.slip.domain.external.ExternalCarrier;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** 외부기사/배송사 마스터 repository. soft-delete 는 entity SQLRestriction 으로 기본 제외한다. */
public interface ExternalCarrierRepository extends JpaRepository<ExternalCarrier, UUID> {

    boolean existsByPhoneAndIsDeletedFalse(String phone);

    @Query("SELECT c FROM ExternalCarrier c WHERE "
            + "(CAST(:q AS string) IS NULL "
            + " OR LOWER(c.name) LIKE LOWER(CONCAT('%', CAST(:q AS string), '%')) ESCAPE '\\' "
            + " OR LOWER(c.phone) LIKE LOWER(CONCAT('%', CAST(:q AS string), '%')) ESCAPE '\\' )")
    Page<ExternalCarrier> searchAdmin(@Param("q") String q, Pageable pageable);

    /** 복구용 deleted 단건 조회. {@code @SQLRestriction} 우회를 위해 native query 를 사용한다. */
    @Query(value = "SELECT * FROM external_carrier c WHERE c.id = :id AND c.is_deleted = true",
            nativeQuery = true)
    Optional<ExternalCarrier> findDeletedById(@Param("id") UUID id);
}
