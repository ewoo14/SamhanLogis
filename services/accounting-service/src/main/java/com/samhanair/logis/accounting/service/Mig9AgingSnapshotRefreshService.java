package com.samhanair.logis.accounting.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.util.Map;
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
    private final MigOpsMetricsRecorder metricsRecorder;

    @Transactional(propagation = Propagation.NEVER)
    public void refresh() {
        try {
            jdbcTemplate.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY partner_aging_snapshot");
            recordAgingSnapshotNet();
        } catch (DataAccessException ex) {
            throw new BusinessException(ErrorCode.MIG9_AGING_REFRESH_FAILED,
                    "partner_aging_snapshot refresh 실패", ex);
        }
    }

    private void recordAgingSnapshotNet() {
        Map<String, Object> row = jdbcTemplate.queryForMap("""
                SELECT COALESCE(SUM(net_receivable), 0) AS net_receivable,
                       COALESCE(SUM(net_payable), 0) AS net_payable
                  FROM partner_aging_snapshot
                """);
        metricsRecorder.recordAgingSnapshotNet(
                asBigDecimal(row.get("net_receivable")),
                asBigDecimal(row.get("net_payable")));
    }

    private static BigDecimal asBigDecimal(Object value) {
        if (value instanceof BigDecimal number) {
            return number;
        }
        if (value instanceof Number number) {
            return BigDecimal.valueOf(number.doubleValue());
        }
        return BigDecimal.ZERO;
    }
}
