package com.samhanair.logis.product.it;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.product.ProductServiceApplication;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/** 단가변동 카테고리별 변동일 내부 API 통합 테스트. */
@SpringBootTest(classes = ProductServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class PriceChangeScheduleInternalControllerIT extends AbstractPostgresIT {

    private static final String INTERNAL_TOKEN = "test-internal-token";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    /** 스케줄 조회 endpoint 는 PartnerOrderLine.categoryKey 4종을 key 로 하는 날짜 맵을 반환한다. */
    @Test
    void priceChangeSchedule_returnsCategoryKeyDateMap() throws Exception {
        mockMvc.perform(get("/products/internal/price-change-schedule")
                        .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.homemulti").value("2026-04-01"))
                .andExpect(jsonPath("$.data.singleSets").value("2026-04-01"))
                .andExpect(jsonPath("$.data.commercialMulti").value("2026-04-01"))
                .andExpect(jsonPath("$.data.oldProducts").value("2026-04-01"));
    }

    /** category CHECK 제약은 order-app categoryKey 4종 외 값을 거부한다. */
    @Test
    void priceChangeSchedule_rejectsInvalidCategoryByCheckConstraint() {
        assertThrows(DataIntegrityViolationException.class, () -> jdbcTemplate.update("""
                INSERT INTO price_change_schedule (
                    id, category, effective_date, created_at, created_by, is_deleted
                ) VALUES (
                    gen_random_uuid(), ?, ?, now(), 'IT', false
                )
                """, "invalidCategory", LocalDate.of(2026, 4, 1)));
    }
}
