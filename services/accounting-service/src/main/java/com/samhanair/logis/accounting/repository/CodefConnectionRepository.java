package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.codef.CodefConnection;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** CODEF 회사 연결 repository. */
public interface CodefConnectionRepository extends JpaRepository<CodefConnection, UUID> {

    /**
     * 활성 CODEF 회사 연결을 단건 조회한다.
     *
     * @return 활성 연결 Optional
     */
    Optional<CodefConnection> findFirstByIsDeletedFalse();

    /**
     * 활성 CODEF 회사 연결을 생성 순서 기준으로 단건 조회한다.
     *
     * @return 활성 연결 Optional
     */
    Optional<CodefConnection> findFirstByIsDeletedFalseOrderByCreatedAtAsc();
}
