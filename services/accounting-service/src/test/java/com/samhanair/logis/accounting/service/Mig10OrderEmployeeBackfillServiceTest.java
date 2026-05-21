package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.client.EmployeeLookupClient;
import com.samhanair.logis.accounting.client.EmployeeLookupResult;
import com.samhanair.logis.common.ecount.EcountMig10Result;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

@ExtendWith(MockitoExtension.class)
class Mig10OrderEmployeeBackfillServiceTest {

    @Mock private NamedParameterJdbcTemplate jdbcTemplate;
    @Mock private EmployeeLookupClient employeeLookupClient;
    private Mig10OrderEmployeeBackfillService service;

    @BeforeEach
    void setUp() {
        service = new Mig10OrderEmployeeBackfillService(jdbcTemplate, employeeLookupClient);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Object.class)))
                .thenReturn(null);
        lenient().when(jdbcTemplate.update(contains("manager_employee_id"), any(SqlParameterSource.class)))
                .thenReturn(1);
        lenient().when(employeeLookupClient.findByFullName("김담당"))
                .thenReturn(List.of(employee(employeeId())));
    }

    @Test
    void 정상_1건_backfill() {
        candidates(row(1, "2026-05-20-001", "김담당", "HASH-1"));

        EcountMig10Result result = service.backfill(500, "tester");

        assertThat(result.backfilled()).isEqualTo(1);
        assertThat(result.lookupMissCount()).isZero();
        assertThat(result.ambiguousCount()).isZero();
    }

    @Test
    void 다건_batch_backfill() {
        candidates(
                row(1, "2026-05-20-001", "김담당", "HASH-1"),
                row(2, "2026-05-20-002", "김담당", "HASH-2"));

        EcountMig10Result result = service.backfill(500, "tester");

        assertThat(result.backfilled()).isEqualTo(2);
    }

    @Test
    void 이미_set된_row는_대상_query에서_skip되도록_filter한다() {
        candidates(row(1, "2026-05-20-001", "김담당", "HASH-1"));

        service.backfill(500, "tester");

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate).query(sql.capture(), any(SqlParameterSource.class),
                org.mockito.ArgumentMatchers.<RowMapper<Mig10OrderEmployeeBackfillService.OrderCandidate>>any());
        assertThat(sql.getValue()).contains("manager_employee_id IS NULL");
        assertThat(sql.getValue()).contains("manager_name IS NOT NULL");
        assertThat(sql.getValue()).contains("is_deleted = FALSE");
    }

    @Test
    void 대상_order_0건은_MIG10_ORDER_NOT_FOUND() {
        candidates();

        assertThatThrownBy(() -> service.backfill(500, "tester"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.MIG10_ORDER_NOT_FOUND);
    }

    @Test
    void employee_lookup_miss는_warning이고_NULL_유지() {
        candidates(row(7, "2026-05-20-001", "미등록", "HASH-7"));
        when(employeeLookupClient.findByFullName("미등록")).thenReturn(List.of());

        EcountMig10Result result = service.backfill(500, "tester");

        assertThat(result.backfilled()).isZero();
        assertThat(result.lookupMissCount()).isEqualTo(1);
        assertThat(result.samples()).extracting(EcountMig10Result.Sample::code)
                .containsExactly("MIG10_EMPLOYEE_LOOKUP_MISS");
        verify(jdbcTemplate, never()).update(contains("manager_employee_id"), any(SqlParameterSource.class));
    }

    @Test
    void employee_lookup_ambiguous는_warning이고_NULL_유지() {
        candidates(row(8, "2026-05-20-001", "동명이인", "HASH-8"));
        when(employeeLookupClient.findByFullName("동명이인"))
                .thenReturn(List.of(employee(employeeId()), employee(otherEmployeeId())));

        EcountMig10Result result = service.backfill(500, "tester");

        assertThat(result.backfilled()).isZero();
        assertThat(result.ambiguousCount()).isEqualTo(1);
        assertThat(result.samples()).extracting(EcountMig10Result.Sample::code)
                .containsExactly("MIG10_EMPLOYEE_AMBIGUOUS");
        verify(jdbcTemplate, never()).update(contains("manager_employee_id"), any(SqlParameterSource.class));
    }

    @Test
    void multi_row_source_row_no를_warning_sample에_보존한다() {
        candidates(row(13, "2026-05-20-013", "미등록", "SRC-13"));
        when(employeeLookupClient.findByFullName("미등록")).thenReturn(List.of());

        EcountMig10Result result = service.backfill(500, "tester");

        assertThat(result.samples().get(0).rowNumber()).isEqualTo(13);
        assertThat(result.samples().get(0).businessKey()).isEqualTo("2026-05-20-013");
    }

    @Test
    void manager_employee_id_UPDATE_파라미터를_직접_검증한다() {
        UUID orderId = orderId();
        candidates(new Mig10OrderEmployeeBackfillService.OrderCandidate(
                orderId, "2026-05-20-001", "김담당", "HASH-1"));

        service.backfill(500, "tester");

        ArgumentCaptor<SqlParameterSource> params = ArgumentCaptor.forClass(SqlParameterSource.class);
        verify(jdbcTemplate).update(contains("manager_employee_id"), params.capture());
        assertThat(params.getValue().getValue("orderId")).isEqualTo(orderId);
        assertThat(params.getValue().getValue("managerEmployeeId")).isEqualTo(employeeId());
        assertThat(params.getValue().getValue("actor")).isEqualTo("tester");
    }

    private void candidates(Mig10OrderEmployeeBackfillService.OrderCandidate... rows) {
        when(jdbcTemplate.<Mig10OrderEmployeeBackfillService.OrderCandidate>query(
                contains("FROM orders"),
                any(SqlParameterSource.class),
                org.mockito.ArgumentMatchers.<RowMapper<Mig10OrderEmployeeBackfillService.OrderCandidate>>any()))
                .thenReturn(List.of(rows));
    }

    private static Mig10OrderEmployeeBackfillService.OrderCandidate row(int rowNo, String orderNo,
                                                                        String managerName,
                                                                        String externalRef) {
        return new Mig10OrderEmployeeBackfillService.OrderCandidate(
                UUID.fromString("00000000-0000-0000-0000-0000000000" + String.format("%02d", rowNo)),
                orderNo,
                managerName,
                externalRef);
    }

    private static EmployeeLookupResult employee(UUID id) {
        return new EmployeeLookupResult(id, "김담당");
    }

    private static UUID orderId() {
        return UUID.fromString("00000000-0000-0000-0000-000000000001");
    }

    private static UUID employeeId() {
        return UUID.fromString("00000000-0000-0000-0000-00000000e001");
    }

    private static UUID otherEmployeeId() {
        return UUID.fromString("00000000-0000-0000-0000-00000000e002");
    }
}
