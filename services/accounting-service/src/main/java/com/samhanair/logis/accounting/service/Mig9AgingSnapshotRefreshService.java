package com.samhanair.logis.accounting.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** MIG-9 partner_aging_snapshot MATERIALIZED VIEW refresh 서비스. */
@Service
@RequiredArgsConstructor
public class Mig9AgingSnapshotRefreshService {

    private final JdbcTemplate jdbcTemplate;

    @Transactional(propagation = Propagation.NEVER)
    public void refresh() {
        try {
            jdbcTemplate.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY partner_aging_snapshot");
        } catch (DataAccessException ex) {
            throw new BusinessException(ErrorCode.MIG9_AGING_REFRESH_FAILED,
                    "partner_aging_snapshot refresh 실패", ex);
        }
    }
}
