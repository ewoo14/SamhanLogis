package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.EmployeeLookupClient;
import com.samhanair.logis.accounting.client.EmployeeLookupResult;
import com.samhanair.logis.common.ecount.EcountCsvSupport;
import com.samhanair.logis.common.ecount.EcountMig10Result;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** MIG-10 — Order.manager_name snapshot 을 user-service Employee UUID 로 backfill. */
@Service
@RequiredArgsConstructor
public class Mig10OrderEmployeeBackfillService {

    private static final UUID BACKFILL_LOCK_NAMESPACE =
            UUID.fromString("dd0e8a0c-85a9-4a7b-b038-7c58f50f6f10");
    private static final int DEFAULT_BATCH_SIZE = 500;
    private static final int MAX_BATCH_SIZE = 2_000;

    private final NamedParameterJdbcTemplate jdbcTemplate;
    private final EmployeeLookupClient employeeLookupClient;

    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public EcountMig10Result backfill(int batchSize, String actorUserId) {
        acquireBackfillLock();
        List<OrderCandidate> rows = candidates(normalizedBatchSize(batchSize));
        if (rows.isEmpty()) {
            throw new BusinessException(ErrorCode.MIG10_ORDER_NOT_FOUND,
                    "MIG-10 Employee 연결 대상 orders row 가 없습니다.");
        }

        EcountMig10Result.Builder result = EcountMig10Result.builder(rows.size());
        String actor = normalizeActor(actorUserId);
        for (OrderCandidate row : rows) {
            List<EmployeeLookupResult> employees = employeeLookupClient.findByFullName(row.managerName());
            if (employees.isEmpty()) {
                result.lookupMiss(row.sourceRowNo(),
                        "담당자명과 일치하는 Employee 가 없습니다: " + row.managerName(),
                        row.orderNo(), row.managerName());
                continue;
            }
            if (employees.size() > 1) {
                result.ambiguous(row.sourceRowNo(),
                        "담당자명과 일치하는 Employee 가 2명 이상입니다: " + row.managerName(),
                        row.orderNo(), row.managerName());
                continue;
            }
            int updated = updateManagerEmployee(row.id(), employees.get(0).employeeId(), actor);
            if (updated > 0) {
                result.backfilled();
            }
        }
        return result.build();
    }

    private List<OrderCandidate> candidates(int batchSize) {
        return jdbcTemplate.query("""
                SELECT id, order_no, manager_name, external_ref
                  FROM orders
                 WHERE manager_name IS NOT NULL
                   AND manager_employee_id IS NULL
                   AND is_deleted = FALSE
                 ORDER BY order_no, external_ref
                 LIMIT :batchSize
                """, new MapSqlParameterSource("batchSize", batchSize), candidateMapper());
    }

    private RowMapper<OrderCandidate> candidateMapper() {
        return (rs, rowNum) -> new OrderCandidate(
                rs.getObject("id", UUID.class),
                rs.getString("order_no"),
                EcountCsvSupport.stripCell(rs.getString("manager_name")),
                rs.getString("external_ref"));
    }

    private int updateManagerEmployee(UUID orderId, UUID managerEmployeeId, String actor) {
        return jdbcTemplate.update("""
                UPDATE orders
                   SET manager_employee_id = :managerEmployeeId,
                       modified_at = NOW(),
                       modified_by = :actor
                 WHERE id = :orderId
                   AND manager_employee_id IS NULL
                   AND is_deleted = FALSE
                """, new MapSqlParameterSource()
                .addValue("orderId", orderId)
                .addValue("managerEmployeeId", managerEmployeeId)
                .addValue("actor", actor));
    }

    private void acquireBackfillLock() {
        jdbcTemplate.queryForObject("SELECT pg_advisory_xact_lock(:lockKey)",
                new MapSqlParameterSource("lockKey",
                        EcountCsvSupport.advisoryLockKey(BACKFILL_LOCK_NAMESPACE, "MIG10_ORDER_EMPLOYEE")),
                Object.class);
    }

    private static int normalizedBatchSize(int batchSize) {
        if (batchSize <= 0) {
            return DEFAULT_BATCH_SIZE;
        }
        return Math.min(batchSize, MAX_BATCH_SIZE);
    }

    private static String normalizeActor(String actorUserId) {
        return actorUserId == null || actorUserId.isBlank() ? "system" : actorUserId;
    }

    public record OrderCandidate(UUID id, String orderNo, String managerName, String externalRef) {
        int sourceRowNo() {
            if (externalRef == null || externalRef.isBlank()) {
                return 0;
            }
            int dash = externalRef.lastIndexOf('-');
            if (dash < 0 || dash == externalRef.length() - 1) {
                return 0;
            }
            try {
                return Integer.parseInt(externalRef.substring(dash + 1));
            } catch (NumberFormatException ex) {
                return 0;
            }
        }
    }
}
