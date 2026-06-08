package com.samhanair.logis.product.repository;

import com.samhanair.logis.product.domain.BranchPipeLookup;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** BranchPipeLookup CRUD + branchCode 기반 조회 (G13). */
public interface BranchPipeLookupRepository extends JpaRepository<BranchPipeLookup, UUID> {

    Optional<BranchPipeLookup> findByBranchCode(String branchCode);

    List<BranchPipeLookup> findAllByBranchCodeOrderByBranchCodeAsc(String branchCode);

    List<BranchPipeLookup> findAllByOrderByBranchCodeAsc();

    /**
     * soft-delete 포함 branchCode 조회 — 시트 재등장 시 unique key 충돌 없이 복구한다.
     *
     * @param branchCode 분기관 코드
     * @return 활성/비활성 포함 기존 row
     */
    @Query(value = "SELECT * FROM branch_pipe_lookup WHERE branch_code = :branchCode LIMIT 1", nativeQuery = true)
    Optional<BranchPipeLookup> findAnyByBranchCodeIncludingDeleted(@Param("branchCode") String branchCode);
}
