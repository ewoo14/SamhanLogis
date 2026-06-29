package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.codef.CodefConnection;
import com.samhanair.logis.accounting.domain.codef.CodefConnectionStatus;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

/** CODEF 회사 연결 repository. */
public interface CodefConnectionRepository extends JpaRepository<CodefConnection, UUID> {

    /**
     * 활성 CODEF 회사 연결을 단건 조회한다.
     *
     * @return 활성 연결 Optional
     */
    Optional<CodefConnection> findFirstByIsDeletedFalse();

    /**
     * CODEF 등록 임계영역을 transaction 단위로 직렬화한다.
     *
     * @return lock 획득 확인값
     */
    @Query(value = "SELECT 1 FROM pg_advisory_xact_lock(667470047)", nativeQuery = true)
    Integer lockRegistration();

    /**
     * 활성 CODEF 회사 연결을 생성 순서 기준으로 단건 조회한다.
     *
     * @return 활성 연결 Optional
     */
    Optional<CodefConnection> findFirstByIsDeletedFalseOrderByCreatedAtAsc();

    /**
     * connectedId가 있는 특정 상태의 CODEF 연결을 생성 순서 기준으로 조회한다.
     *
     * @param status 연결 상태
     * @return CODEF 연결 Optional
     */
    Optional<CodefConnection> findFirstByStatusAndConnectedIdIsNotNullAndIsDeletedFalseOrderByCreatedAtAsc(
            CodefConnectionStatus status);
}
