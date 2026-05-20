package com.samhanair.logis.user.repository;

import com.samhanair.logis.user.domain.PayrollEmployee;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** MIG-6 급여관리사원 repository. */
public interface PayrollEmployeeRepository extends JpaRepository<PayrollEmployee, UUID> {

    Optional<PayrollEmployee> findByEmployee_IdAndIsDeletedFalse(UUID employeeId);
}
