package com.samhanair.logis.auth.repository;

import com.samhanair.logis.auth.domain.AccountGroup;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 계정 권한그룹 배속 저장소. */
public interface AccountGroupRepository extends JpaRepository<AccountGroup, UUID> {

    List<AccountGroup> findByAccountIdAndIsDeletedFalse(UUID accountId);

    List<AccountGroup> findByGroupIdAndIsDeletedFalse(UUID groupId);

    long countByGroupIdAndIsDeletedFalse(UUID groupId);
}
