package com.samhanair.logis.auth.repository;

import com.samhanair.logis.auth.domain.AccountGroup;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 계정 권한그룹 배속 저장소. */
public interface AccountGroupRepository extends JpaRepository<AccountGroup, UUID> {

    /**
     * 계정의 활성 그룹 배속을 groupId 오름차순으로 조회한다.
     *
     * <p>C5-1 P2: JWT {@code groups} claim comma-join 의 순서 결정성 보장 —
     * 동일 계정은 로그인마다 동일한 claim 문자열을 받는다(소비처 순서 의존/캐시 키 대비).
     */
    List<AccountGroup> findByAccountIdAndIsDeletedFalseOrderByGroupIdAsc(UUID accountId);

    List<AccountGroup> findByGroupIdAndIsDeletedFalse(UUID groupId);

    Optional<AccountGroup> findByAccountIdAndGroupIdAndIsDeletedFalse(UUID accountId, UUID groupId);

    long countByGroupIdAndIsDeletedFalse(UUID groupId);
}
