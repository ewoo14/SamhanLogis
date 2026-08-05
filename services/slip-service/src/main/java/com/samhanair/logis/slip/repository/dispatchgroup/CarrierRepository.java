package com.samhanair.logis.slip.repository.dispatchgroup;

import com.samhanair.logis.slip.domain.dispatchgroup.Carrier;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CarrierRepository extends JpaRepository<Carrier, UUID> {
    Optional<Carrier> findByIdAndIsDeletedFalse(UUID id);
    Optional<Carrier> findByCodeIgnoreCaseAndIsDeletedFalse(String code);
    boolean existsByCodeIgnoreCaseAndIsDeletedFalse(String code);
    List<Carrier> findAllByOrderByNameAsc();
}
