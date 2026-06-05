package com.samhanair.logis.auth.repository;

import com.samhanair.logis.auth.domain.AccountPermissionOverride;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 계정별 페이지 권한 override 저장소. */
public interface AccountPermissionOverrideRepository
        extends JpaRepository<AccountPermissionOverride, UUID> {

    List<AccountPermissionOverride> findByAccountIdAndIsDeletedFalse(UUID accountId);
}
