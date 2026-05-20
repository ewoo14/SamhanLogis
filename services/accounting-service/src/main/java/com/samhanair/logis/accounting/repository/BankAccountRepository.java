package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.BankAccount;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** MIG-6 통장계좌 repository. */
public interface BankAccountRepository extends JpaRepository<BankAccount, UUID> {

    Optional<BankAccount> findByAccountCodeAndIsDeletedFalse(String accountCode);
}
