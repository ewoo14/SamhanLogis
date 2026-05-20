package com.samhanair.logis.user.repository;

import com.samhanair.logis.user.domain.EmployeeCard;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** MIG-6 인사카드 repository. */
public interface EmployeeCardRepository extends JpaRepository<EmployeeCard, UUID> {

    Optional<EmployeeCard> findByEmployee_IdAndIsDeletedFalse(UUID employeeId);
}
