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

    /**
     * REFRESH ... CONCURRENTLY 는 트랜잭션 블록 안에서 실행할 수 없다.
     *
     * <p>NOT_SUPPORTED: 바인딩된 트랜잭션 리소스를 suspend 하고 신규 autocommit 커넥션으로
     * 실행한다. afterCommit 콜백(원 tx 리소스가 아직 스레드에 바인딩된 시점 — E3 S2 입금보고서
     * confirm/cancel/재게시 경로)에서도 안전하다. 과거 NEVER 는 afterCommit 시점을 "기존
     * 트랜잭션 존재"로 판정해 {@code IllegalTransactionStateException} 으로 매번 실패했다
     * (PR #710 라이브 QA 실증). MIG 커맨드 경로(트랜잭션 없음)는 동작 불변.
     */
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
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
