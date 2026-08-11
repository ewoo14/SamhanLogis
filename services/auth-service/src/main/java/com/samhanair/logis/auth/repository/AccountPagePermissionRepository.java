package com.samhanair.logis.auth.repository;

import com.samhanair.logis.auth.domain.AccountPagePermission;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 계정 단위 페이지 권한 저장소. */
public interface AccountPagePermissionRepository extends JpaRepository<AccountPagePermission, UUID> {

    List<AccountPagePermission> findByActorId(String actorId);

    List<AccountPagePermission> findByAccountId(UUID accountId);

    List<AccountPagePermission> findByAccountIdOrderByPageCodeAsc(UUID accountId);

    Optional<AccountPagePermission> findByAccountIdAndPageCode(UUID accountId, String pageCode);
}
