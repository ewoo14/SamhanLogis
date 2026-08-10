package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

@ExtendWith(MockitoExtension.class)
class AccountingAdminQueryServiceTest {

    @Mock private NamedParameterJdbcTemplate jdbcTemplate;

    private AccountingAdminQueryService service;

    @BeforeEach
    void setUp() {
        service = new AccountingAdminQueryService(jdbcTemplate);
    }

    @Test
    void ledgerDailyDiff_usesUnfilteredRawDailyTotals() {
        when(jdbcTemplate.queryForObject(anyString(), any(MapSqlParameterSource.class), eq(Long.class)))
                .thenReturn(0L);
        when(jdbcTemplate.query(anyString(), any(MapSqlParameterSource.class),
                        org.mockito.ArgumentMatchers.<RowMapper<Object>>any()))
                .thenReturn(List.of());

        service.listSalesLedger(
                LocalDate.of(2026, 5, 1),
                LocalDate.of(2026, 5, 31),
                "삼한",
                "TRANSFORMED",
                PageRequest.of(0, 20));

        org.mockito.ArgumentCaptor<String> sqlCaptor = org.mockito.ArgumentCaptor.forClass(String.class);
        org.mockito.Mockito.verify(jdbcTemplate).query(
                sqlCaptor.capture(),
                any(MapSqlParameterSource.class),
                org.mockito.ArgumentMatchers.<RowMapper<Object>>any());
        String sql = sqlCaptor.getValue();
        assertThat(sql).contains("raw_totals");
        assertThat(sql).contains("GROUP BY transaction_date");
        assertThat(sql).doesNotContain("SUM(total_amount) OVER (PARTITION BY transaction_date)");
    }

    @Test
    void ledgerPartnerName_escapesLikeWildcards_beforeJdbcQuery() {
        when(jdbcTemplate.queryForObject(anyString(), any(MapSqlParameterSource.class), eq(Long.class)))
                .thenReturn(0L);
        when(jdbcTemplate.query(anyString(), any(MapSqlParameterSource.class),
                        org.mockito.ArgumentMatchers.<RowMapper<Object>>any()))
                .thenReturn(List.of());

        service.listSalesLedger(
                LocalDate.of(2026, 5, 1),
                LocalDate.of(2026, 5, 31),
                "LUNA%_\\",
                "TRANSFORMED",
                PageRequest.of(0, 20));

        org.mockito.ArgumentCaptor<MapSqlParameterSource> paramsCaptor =
                org.mockito.ArgumentCaptor.forClass(MapSqlParameterSource.class);
        org.mockito.Mockito.verify(jdbcTemplate).query(
                anyString(),
                paramsCaptor.capture(),
                org.mockito.ArgumentMatchers.<RowMapper<Object>>any());
        assertThat(paramsCaptor.getValue().getValue("partnerName"))
                .isEqualTo("%luna\\%\\_\\\\%");
    }
}
