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
                .andExpect(jsonPath("$.data.homemulti").value("2026-07-01"))
                .andExpect(jsonPath("$.data.singleSets").value("2026-07-01"))
                .andExpect(jsonPath("$.data.commercialMulti").value("2026-07-01"))
                .andExpect(jsonPath("$.data.oldProducts").value("2026-07-01"));
    }

    /** 내부 endpoint 는 X-Internal-Token 이 없으면 product-service 규약대로 401 을 반환한다. */
    @Test
    void priceChangeSchedule_withoutInternalToken_returns401() throws Exception {
        mockMvc.perform(get("/products/internal/price-change-schedule"))
                .andExpect(status().isUnauthorized());
    }

    /** 내부 endpoint 는 X-Internal-Token 이 틀리면 401 을 반환한다. */
    @Test
    void priceChangeSchedule_withWrongInternalToken_returns401() throws Exception {
        mockMvc.perform(get("/products/internal/price-change-schedule")
                        .header("X-Internal-Token", "wrong-token"))
                .andExpect(status().isUnauthorized());
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

    /** 활성행 partial unique 는 같은 category 의 활성 스케줄 중복을 거부한다. */
    @Test
    void priceChangeSchedule_rejectsDuplicateActiveCategoryByPartialUnique() {
        assertThrows(DataIntegrityViolationException.class, () -> jdbcTemplate.update("""
                INSERT INTO price_change_schedule (
                    id, category, effective_date, created_at, created_by, is_deleted
                ) VALUES (
                    gen_random_uuid(), ?, ?, now(), 'IT', false
                )
                """, "homemulti", LocalDate.of(2026, 5, 1)));
    }

    /** @SQLRestriction 은 soft-delete 된 행을 제외하고 대체 활성행만 응답한다. */
    @Test
    void priceChangeSchedule_excludesSoftDeletedRowAndReturnsReplacement() throws Exception {
        jdbcTemplate.update("""
                UPDATE price_change_schedule
                   SET is_deleted = true,
                       deleted_at = now(),
                       deleted_by = 'IT'
                 WHERE category = ?
                """, "homemulti");
        jdbcTemplate.update("""
                INSERT INTO price_change_schedule (
                    id, category, effective_date, created_at, created_by, is_deleted
                ) VALUES (
                    gen_random_uuid(), ?, ?, now(), 'IT', false
                )
                """, "homemulti", LocalDate.of(2026, 5, 1));

        mockMvc.perform(get("/products/internal/price-change-schedule")
                        .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.homemulti").value("2026-05-01"))
                .andExpect(jsonPath("$.data.singleSets").value("2026-07-01"))
                .andExpect(jsonPath("$.data.commercialMulti").value("2026-07-01"))
                .andExpect(jsonPath("$.data.oldProducts").value("2026-07-01"));
    }

    // -------------------------------------------------------------------------
    // S4a (#17) — GET /products/internal/price-change-default-variant
    // -------------------------------------------------------------------------

    /** V23 마이그레이션 기본값(FALSE)이 4 카테고리 전부에 그대로 반영되어야 한다. */
    @Test
    void priceChangeDefaultVariant_returnsCategoryKeyBooleanMap() throws Exception {
        mockMvc.perform(get("/products/internal/price-change-default-variant")
                        .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.homemulti").value(false))
                .andExpect(jsonPath("$.data.singleSets").value(false))
                .andExpect(jsonPath("$.data.commercialMulti").value(false))
                .andExpect(jsonPath("$.data.oldProducts").value(false));
    }

    /** admin 이 특정 카테고리의 defaultPreChange 를 TRUE 로 바꾸면 내부 endpoint 에도 즉시 반영된다. */
    @Test
    void priceChangeDefaultVariant_reflectsUpdatedRowValue() throws Exception {
        jdbcTemplate.update("""
                UPDATE price_change_schedule
                   SET default_pre_change = true
                 WHERE category = ?
                """, "singleSets");

        mockMvc.perform(get("/products/internal/price-change-default-variant")
                        .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.homemulti").value(false))
                .andExpect(jsonPath("$.data.singleSets").value(true))
                .andExpect(jsonPath("$.data.commercialMulti").value(false))
                .andExpect(jsonPath("$.data.oldProducts").value(false));
    }

    /** 신규 endpoint 도 기존과 동일하게 X-Internal-Token 이 없으면 401 을 반환한다. */
    @Test
    void priceChangeDefaultVariant_withoutInternalToken_returns401() throws Exception {
        mockMvc.perform(get("/products/internal/price-change-default-variant"))
                .andExpect(status().isUnauthorized());
    }
}
