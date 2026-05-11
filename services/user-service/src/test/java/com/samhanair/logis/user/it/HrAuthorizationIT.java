package com.samhanair.logis.user.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.common.security.Role;
import com.samhanair.logis.security.HrAuthorizationHelper;
import com.samhanair.logis.user.UserServiceApplication;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 인사 카테고리 접근 가드 통합 테스트 — Phase 12.
 *
 * <h2>시나리오</h2>
 * <ul>
 *   <li>TC-1: 대표실 부서 + MASTER → {@code /api/v1/admin/users} 200 (접근 허용)</li>
 *   <li>TC-2: 일반 부서(영업1팀) + MASTER → {@code /api/v1/admin/users} 403 (부서 불일치)</li>
 *   <li>TC-3: 대표실 부서 + SALES → {@code /api/v1/admin/users} 403 (역할 부족)</li>
 *   <li>TC-4: {@code GET /api/v1/users/me/is-executive-office} 응답 검증
 *             (대표실 true / 일반 false)</li>
 * </ul>
 *
 * <p>외부 의존 격리 ({@code @MockBean}):
 * <ul>
 *   <li>{@link com.samhanair.logis.user.client.AuthClient} — auth-service HTTP 호출 stub</li>
 * </ul>
 *
 * <p>Docker 미가용 시 {@link AbstractPostgresIT.DockerAvailableCondition} 에 의해 자동 skip.
 */
@SpringBootTest(classes = UserServiceApplication.class)
@AutoConfigureMockMvc
class HrAuthorizationIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private com.samhanair.logis.user.client.AuthClient authClient;

    @BeforeEach
    void setUp() {
        lenient().doNothing().when(authClient).createAccount(
                any(java.util.UUID.class), anyString(), anyString(), anyString(), any(Role.class));
        lenient().doNothing().when(authClient).createAccount(
                any(java.util.UUID.class), anyString(), anyString(), anyString(), any(Role.class),
                org.mockito.ArgumentMatchers.anyBoolean());
        lenient().doNothing().when(authClient).updateRole(any(java.util.UUID.class), any(Role.class));
        lenient().doNothing().when(authClient).updateDisplayName(any(java.util.UUID.class), anyString());
        lenient().doNothing().when(authClient).disable(any(java.util.UUID.class));
        lenient().doNothing().when(authClient).delete(any(java.util.UUID.class));
        lenient().doNothing().when(authClient).updateDepartmentName(any(java.util.UUID.class), anyString());
    }

    // -------------------------------------------------------------------------
    // TC-1: 대표실 + MASTER → 200
    // -------------------------------------------------------------------------

    /**
     * TC-1 — 대표실 부서 소속 MASTER 는 /admin/users 목록 접근 허용.
     *
     * <p>{@code X-User-Department: 대표실} + {@code X-User-Role: MASTER} 헤더를 직접 주입하여
     * gateway 경유 요청을 시뮬레이션. {@link HrAuthorizationHelper#isExecutiveOffice()} 가 true 반환.
     */
    @Test
    @DisplayName("TC-1: 대표실+MASTER → /admin/users 200")
    void tc1_executiveOfficeMaster_allowed() throws Exception {
        mockMvc.perform(get("/api/v1/admin/users")
                        .header("X-User-Id", "a0000000-0000-0000-0000-000000000001")
                        .header("X-User-Role", "MASTER")
                        .header("X-User-Department", HrAuthorizationHelper.EXECUTIVE_OFFICE_NAME))
                .andExpect(status().isOk());
    }

    // -------------------------------------------------------------------------
    // TC-2: 일반 부서 + MASTER → 403
    // -------------------------------------------------------------------------

    /**
     * TC-2 — 영업1팀 소속 MASTER 는 /admin/users 목록 접근 거절.
     *
     * <p>{@code X-User-Department: 영업1팀} — 대표실 불일치 → {@code @hr.isExecutiveOffice()} false
     * → Spring Security AccessDeniedException → 403.
     */
    @Test
    @DisplayName("TC-2: 영업1팀+MASTER → /admin/users 403")
    void tc2_nonExecutiveMaster_forbidden() throws Exception {
        mockMvc.perform(get("/api/v1/admin/users")
                        .header("X-User-Id", "a0000000-0000-0000-0000-000000000003")
                        .header("X-User-Role", "MASTER")
                        .header("X-User-Department", "영업1팀"))
                .andExpect(status().isForbidden());
    }

    // -------------------------------------------------------------------------
    // TC-3: 대표실 + SALES → 403
    // -------------------------------------------------------------------------

    /**
     * TC-3 — 대표실 소속이어도 SALES 역할은 /admin/users 접근 거절.
     *
     * <p>{@code @hr.isExecutiveOffice() and hasAnyRole('MASTER','MANAGER')} — SpEL 단락 평가.
     * SALES 역할은 허용 역할 목록에 없으므로 403.
     */
    @Test
    @DisplayName("TC-3: 대표실+SALES → /admin/users 403")
    void tc3_executiveOfficeSales_forbidden() throws Exception {
        mockMvc.perform(get("/api/v1/admin/users")
                        .header("X-User-Id", "a0000000-0000-0000-0000-000000000004")
                        .header("X-User-Role", "SALES")
                        .header("X-User-Department", HrAuthorizationHelper.EXECUTIVE_OFFICE_NAME))
                .andExpect(status().isForbidden());
    }

    // -------------------------------------------------------------------------
    // TC-4: /me/is-executive-office 응답 검증
    // -------------------------------------------------------------------------

    /**
     * TC-4a — 대표실 소속 사용자 → isExecutiveOffice = true.
     */
    @Test
    @DisplayName("TC-4a: 대표실 소속 → isExecutiveOffice=true")
    void tc4a_executiveOffice_isTrue() throws Exception {
        mockMvc.perform(get("/api/v1/users/me/is-executive-office")
                        .header("X-User-Id", "a0000000-0000-0000-0000-000000000001")
                        .header("X-User-Role", "MASTER")
                        .header("X-User-Department", HrAuthorizationHelper.EXECUTIVE_OFFICE_NAME))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.isExecutiveOffice").value(true))
                .andExpect(jsonPath("$.data.departmentName").value(HrAuthorizationHelper.EXECUTIVE_OFFICE_NAME));
    }

    /**
     * TC-4b — 일반 부서 소속 사용자 → isExecutiveOffice = false.
     */
    @Test
    @DisplayName("TC-4b: 영업1팀 소속 → isExecutiveOffice=false")
    void tc4b_nonExecutiveOffice_isFalse() throws Exception {
        mockMvc.perform(get("/api/v1/users/me/is-executive-office")
                        .header("X-User-Id", "a0000000-0000-0000-0000-000000000004")
                        .header("X-User-Role", "SALES")
                        .header("X-User-Department", "영업1팀"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.isExecutiveOffice").value(false))
                .andExpect(jsonPath("$.data.departmentName").value("영업1팀"));
    }

    /**
     * TC-4c — 부서 헤더 미존재(구버전 토큰) → isExecutiveOffice = false, departmentName = null.
     */
    @Test
    @DisplayName("TC-4c: X-User-Department 헤더 없음 → isExecutiveOffice=false, departmentName=null")
    void tc4c_noDepartmentHeader_isFalse() throws Exception {
        mockMvc.perform(get("/api/v1/users/me/is-executive-office")
                        .header("X-User-Id", "a0000000-0000-0000-0000-000000000004")
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.isExecutiveOffice").value(false))
                .andExpect(jsonPath("$.data.departmentName").doesNotExist());
    }

    // -------------------------------------------------------------------------
    // Helper — X-User-Department 헤더 미존재 시 admin 접근 거절 검증
    // -------------------------------------------------------------------------

    /**
     * TC-5 — X-User-Department 헤더 미존재 MASTER → /admin/users 403.
     *
     * <p>구버전 JWT(departmentName claim 없음) 를 사용하는 클라이언트가
     * 인사 카테고리에 접근하면 거절됨을 확인.
     */
    @Test
    @DisplayName("TC-5: X-User-Department 헤더 없는 MASTER → /admin/users 403")
    void tc5_missingDepartmentHeader_forbidden() throws Exception {
        mockMvc.perform(get("/api/v1/admin/users")
                        .header("X-User-Id", "a0000000-0000-0000-0000-000000000001")
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isForbidden());
    }
}
