package com.samhanair.logis.arologis.repository;

import com.samhanair.logis.arologis.domain.ArologisRoleChangeHistory;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** 아로로지스 직원 롤 변경 이력 저장소. */
@Repository
public interface ArologisRoleChangeHistoryRepository extends JpaRepository<ArologisRoleChangeHistory, UUID> {

    /** 직원별 롤 변경 이력 최신순 조회. */
    List<ArologisRoleChangeHistory> findAllByEmployeeIdAndIsDeletedFalseOrderByCreatedAtDesc(UUID employeeId);
}
