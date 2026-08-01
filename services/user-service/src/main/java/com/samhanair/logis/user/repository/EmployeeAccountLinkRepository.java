package com.samhanair.logis.user.repository;

import com.samhanair.logis.user.domain.EmployeeAccountLink;
import com.samhanair.logis.user.domain.LinkStatus;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 직원 계정 연결 계획 저장소. */
public interface EmployeeAccountLinkRepository extends JpaRepository<EmployeeAccountLink, UUID> {

    List<EmployeeAccountLink> findByPlanKeyAndStatus(String planKey, LinkStatus status);
}
