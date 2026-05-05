package com.samhanair.logis.dcconfig.repository;

import com.samhanair.logis.dcconfig.domain.DcRule;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** DcRule 조회 — partner 별 + GLOBAL (partner_id IS NULL) 조합. */
public interface DcRuleRepository extends JpaRepository<DcRule, UUID> {

    /** 특정 거래처의 룰 (partner) + 공통 룰 (partner=NULL) 모두 조회 — priority asc 정렬. */
    List<DcRule> findByPartner_IdOrPartnerIsNullOrderByPriorityAsc(UUID partnerId);

    /** GLOBAL 룰만 (모든 거래처 공통). */
    List<DcRule> findByPartnerIsNullOrderByPriorityAsc();
}
