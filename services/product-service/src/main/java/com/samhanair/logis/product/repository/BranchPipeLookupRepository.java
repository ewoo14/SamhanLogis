package com.samhanair.logis.product.repository;

import com.samhanair.logis.product.domain.BranchPipeLookup;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** BranchPipeLookup CRUD + branchCode 기반 조회 (G13). */
public interface BranchPipeLookupRepository extends JpaRepository<BranchPipeLookup, UUID> {

    Optional<BranchPipeLookup> findByBranchCode(String branchCode);

    List<BranchPipeLookup> findAllByBranchCodeOrderByBranchCodeAsc(String branchCode);

    List<BranchPipeLookup> findAllByOrderByBranchCodeAsc();
}
