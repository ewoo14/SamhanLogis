package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.FixedAssetType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** MIG-6 고정자산유형 repository. */
public interface FixedAssetTypeRepository extends JpaRepository<FixedAssetType, UUID> {

    Optional<FixedAssetType> findByTypeCodeAndIsDeletedFalse(String typeCode);
}
