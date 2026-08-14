package com.samhanair.logis.log.repository;

import com.samhanair.logis.log.domain.AuditLog;
import com.samhanair.logis.log.web.ActivityLogSearchCondition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

/** DEV-3 활동 로그 다중 조건 검색. */
public interface AuditLogActivityRepository {

    /** 등급별 ILM 인덱스에 감사 문서를 저장한다. */
    AuditLog persistByRetentionClass(AuditLog auditLog);

    /** optional 조건을 모두 AND 로 결합해 활동 로그를 검색한다. */
    Page<AuditLog> searchActivity(ActivityLogSearchCondition condition, Pageable pageable);
}
