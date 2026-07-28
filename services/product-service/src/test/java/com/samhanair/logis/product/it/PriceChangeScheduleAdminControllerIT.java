package com.samhanair.logis.product.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.product.ProductServiceApplication;
import com.samhanair.logis.product.domain.PriceChangeSchedule;
import com.samhanair.logis.product.repository.PriceChangeScheduleRepository;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * 단가변동 스케줄 admin GET/PUT IT (S4a, #17) — 실 DB(V22 4행 seed) + 실
 * {@code @RequirePermission} 가드({@link DynamicPermissionClient} 경계만 mock, PermissionAspect 는 실행).
 *
 * <p>{@link PriceChangeScheduleInternalControllerIT} 와 동일한 4행 singleton-like 테이블을
 * 공유하므로, 다른 IT 클래스의 고정값 단언(2026-07-01 등)을 깨뜨리지 않도록 {@code @Transactional}
 * 로 각 테스트 종료 시 rollback 한다 (같은 파일의 기존 관례 mirror).
 */
@SpringBootTest(classes = ProductServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class PriceChangeScheduleAdminControllerIT extends AbstractPostgresIT {

    private static final String BASE_PATH = "/api/v1/products/admin/price-change-schedule";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private PriceChangeScheduleRepository priceChangeScheduleRepository;

    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setupLenientStubs() {
        Mockito.lenient()
                .when(dynamicPermissionClient.canView(Mockito.anyString(), Mockito.anyString()))
                .thenReturn(true);
        Mockito.lenient()
                .when(dynamicPermissionClient.canEdit(Mockito.anyString(), Mockito.anyString()))
                .thenReturn(true);
        Mockito.lenient()
                .when(dynamicPermissionClient.check(
                        Mockito.any(UUID.class), Mockito.anyString(), Mockito.any(PermissionAction.class)))
                .thenReturn(true);
    }

    // -------------------------------------------------------------------------
    // GET /api/v1/products/admin/price-change-schedule
    // -------------------------------------------------------------------------

    @Test
    @WithMockUser(username = "manager-user", authorities = {"ROLE_MANAGER"})
    void list_grant_returns4RowsInCategoryKeysOrder() throws Exception {
        mockMvc.perform(get(BASE_PATH)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(4))
                .andExpect(jsonPath("$.data[0].category").value("homemulti"))
                .andExpect(jsonPath("$.data[1].category").value("singleSets"))
                .andExpect(jsonPath("$.data[2].category").value("commercialMulti"))
                .andExpect(jsonPath("$.data[3].category").value("oldProducts"))
                .andExpect(jsonPath("$.data[0].effectiveDate").value("2026-07-01"))
                .andExpect(jsonPath("$.data[0].defaultPreChange").value(false));
    }

    @Test
    @WithMockUser(username = "sales-denied", authorities = {"ROLE_SALES"})
    void list_deny_returns403() throws Exception {
        Mockito.when(dynamicPermissionClient.check(
                        Mockito.any(UUID.class), Mockito.eq("products.price-schedule"), Mockito.eq(PermissionAction.VIEW)))
                .thenReturn(false);

        mockMvc.perform(get(BASE_PATH)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isForbidden());
    }

    // -------------------------------------------------------------------------
    // PUT /api/v1/products/admin/price-change-schedule/{category}
    // -------------------------------------------------------------------------

    @Test
    @WithMockUser(username = "manager-user", authorities = {"ROLE_MANAGER"})
    void update_bothFields_overwritesBoth() throws Exception {
        mockMvc.perform(put(BASE_PATH + "/{category}", "homemulti")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"effectiveDate":"2026-08-01","defaultPreChange":true}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.category").value("homemulti"))
                .andExpect(jsonPath("$.data.effectiveDate").value("2026-08-01"))
                .andExpect(jsonPath("$.data.defaultPreChange").value(true));

        PriceChangeSchedule persisted = priceChangeScheduleRepository.findByCategory("homemulti").orElseThrow();
        assertThat(persisted.getEffectiveDate()).isEqualTo(LocalDate.of(2026, 8, 1));
        assertThat(persisted.getDefaultPreChange()).isTrue();
    }

    /** null-keep partial update: defaultPreChange 만 보내면 effectiveDate 는 기존 값을 유지한다. */
    @Test
    @WithMockUser(username = "manager-user", authorities = {"ROLE_MANAGER"})
    void update_defaultPreChangeOnly_keepsExistingEffectiveDate() throws Exception {
        mockMvc.perform(put(BASE_PATH + "/{category}", "oldProducts")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"defaultPreChange":true}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.effectiveDate").value("2026-07-01"))
                .andExpect(jsonPath("$.data.defaultPreChange").value(true));
    }

    /** null-keep partial update: effectiveDate 만 보내면 defaultPreChange 는 기존 값을 유지한다. */
    @Test
    @WithMockUser(username = "manager-user", authorities = {"ROLE_MANAGER"})
    void update_effectiveDateOnly_keepsExistingDefaultPreChange() throws Exception {
        mockMvc.perform(put(BASE_PATH + "/{category}", "commercialMulti")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"effectiveDate":"2026-09-15"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.effectiveDate").value("2026-09-15"))
                .andExpect(jsonPath("$.data.defaultPreChange").value(false));
    }

    @Test
    @WithMockUser(username = "manager-user", authorities = {"ROLE_MANAGER"})
    void update_invalidCategory_returns404() throws Exception {
        mockMvc.perform(put(BASE_PATH + "/{category}", "notACategory")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isNotFound());
    }

    @Test
    @WithMockUser(username = "sales-denied", authorities = {"ROLE_SALES"})
    void update_deny_returns403() throws Exception {
        Mockito.when(dynamicPermissionClient.check(
                        Mockito.any(UUID.class), Mockito.eq("products.price-schedule"), Mockito.eq(PermissionAction.UPDATE)))
                .thenReturn(false);

        mockMvc.perform(put(BASE_PATH + "/{category}", "homemulti")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isForbidden());
    }
}
