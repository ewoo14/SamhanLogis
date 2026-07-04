package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.UserBankTxnFilter;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 사용자별 입출금내역 label 필터 repository. */
public interface UserBankTxnFilterRepository extends JpaRepository<UserBankTxnFilter, UUID> {

    Optional<UserBankTxnFilter> findByUserId(UUID userId);
}
