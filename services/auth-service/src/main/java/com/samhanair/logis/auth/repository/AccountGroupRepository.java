package com.samhanair.logis.auth.repository;

import com.samhanair.logis.auth.domain.AccountGroup;
import java.util.Collection;
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

    /**
     * 여러 계정의 활성 그룹 배속을 한 번에 조회한다 (N+1 방지).
     *
     * <p>P2: {@code listAccounts} 에서 계정별 개별 쿼리를 발생시키던 N+1 를 제거하기 위해 추가.
     * 호출자가 반환 목록을 accountId 기준으로 그룹화하여 사용한다.
     *
     * @param accountIds 계정 UUID 집합
     * @return is_deleted=false 인 AccountGroup 목록
     */
    List<AccountGroup> findByAccountIdInAndIsDeletedFalse(Collection<UUID> accountIds);

    List<AccountGroup> findByGroupIdAndIsDeletedFalse(UUID groupId);

    Optional<AccountGroup> findByAccountIdAndGroupIdAndIsDeletedFalse(UUID accountId, UUID groupId);

    long countByGroupIdAndIsDeletedFalse(UUID groupId);
}
