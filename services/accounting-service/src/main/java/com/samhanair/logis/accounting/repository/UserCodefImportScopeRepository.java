package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.UserCodefImportScope;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 사용자별 외부계정 가져오기 선택 scope repository. */
public interface UserCodefImportScopeRepository extends JpaRepository<UserCodefImportScope, UUID> {

    Optional<UserCodefImportScope> findByUserIdAndConnectedIdAndIsDeletedFalse(UUID userId, String connectedId);
}
