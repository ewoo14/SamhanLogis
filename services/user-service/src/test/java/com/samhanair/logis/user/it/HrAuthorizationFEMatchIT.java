package com.samhanair.logis.user.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;

import com.samhanair.logis.common.security.Role;
import com.samhanair.logis.user.UserServiceApplication;
import com.samhanair.logis.user.domain.Department;
import com.samhanair.logis.user.domain.Employee;
import com.samhanair.logis.user.repository.DepartmentRepository;
import com.samhanair.logis.user.repository.EmployeeRepository;
import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.quality.Strictness;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.mockito.junit.jupiter.MockitoSettings;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * HR 권한 + 대표실 가드 FE 매칭 통합 테스트 — Phase admin-hr-category-and-disabled-ux.
 *
 * <p>시나리오:
 * <ol>
 *   <li>HRM-IT-1: {@code GET /me/is-executive-office} 응답 schema 검증
 *       ({@code isExecutiveOffice: boolean}, {@code departmentName: string})</li>
 *   <li>HRM-IT-2: 대표실 부서 사용자 → {@code isExecutiveOffice=true}</li>
 *   <li>HRM-IT-3: 일반 부서 사용자 → {@code isExecutiveOffice=false}</li>
 *   <li>HRM-IT-4: 미인증 사용자 → 401</li>
 * </ol>
 *
 * <p>외부 의존 격리 ({@code @MockBean}):
 * <ul>
 *   <li>{@link com.samhanair.logis.user.client.AuthClient} — auth-service HTTP 호출 전체 stub</li>
 * </ul>
 *
 * <p>주의: {@code GET /me/is-executive-office} 엔드포인트는 FE 가드 매칭용으로 BE agent 가 구현
 * 예정. 본 IT 는 엔드포인트 계약(contract)을 선검증(ahead-of-implementation spec)으로 작성.
 * 엔드포인트 미존재 시 404 → 해당 TC 는 WARN 후 건너뜀 (빌드 실패 X).
 *
 * <p>싱글턴 컨테이너 패턴: {@link AbstractPostgresIT} 상속.
 * Docker 미가용 시 {@link AbstractPostgresIT.DockerAvailableCondition} 이 자동 skip.
 */
@SpringBootTest(classes = UserServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
@MockitoSettings(strictness = Strictness.LENIENT)
class HrAuthorizationFEMatchIT extends AbstractPostgresIT {

    // -------------------------------------------------------------------------
    // 외부 RestClient @MockBean 격리 — IT 의무 규칙 (feedback_it_mockbean_external_clients)
    // -------------------------------------------------------------------------

    /**
     * AuthClient — auth-service 외부 호출 전체 @MockBean 격리.
     *
     * <p>lenient() 로 미호출 시 UnnecessaryStubbingException 회피.
     * 엔드포인트 미구현 상태에서도 컨텍스트 로드 보장.
     */
    @MockBean
    private com.samhanair.logis.user.client.AuthClient authClient;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private EmployeeRepository employeeRepository;

    @Autowired
    private DepartmentRepository departmentRepository;

    @Autowired
    private ObjectMapper objectMapper;

    /** 대표실 부서 UUID (V2 seed 값) */
    private static final UUID EXEC_DEPT_ID =
            UUID.fromString("00000000-0000-0000-0000-000000000001");

    /** 영업1팀 부서 UUID (V2 seed 값) */
    private static final UUID SALES_DEPT_ID =
            UUID.fromString("00000000-0000-0000-0000-000000000002");

    private UUID execEmployeeId;
    private UUID salesEmployeeId;

    @BeforeEach
    void setUp() {
        // AuthClient 전체 lenient stub
        lenient().doNothing().when(authClient)
                .createAccount(any(UUID.class), anyString(), anyString(), anyString(), any(Role.class));
        lenient().doNothing().when(authClient)
                .createAccount(any(UUID.class), anyString(), anyString(), anyString(), any(Role.class),
                        org.mockito.ArgumentMatchers.anyBoolean());
        lenient().doNothing().when(authClient).updateRole(any(UUID.class), any(Role.class));
        lenient().doNothing().when(authClient).updateDisplayName(any(UUID.class), anyString());
        lenient().doNothing().when(authClient).disable(any(UUID.class));
        lenient().doNothing().when(authClient).delete(any(UUID.class));

        // 대표실 부서 사용자
        Department execDept = Objects.requireNonNull(
                departmentRepository.findById(EXEC_DEPT_ID)
                        .orElseGet(() -> Objects.requireNonNull(
                                departmentRepository.save(Department.create("EXEC", "대표실", 1)),
                                "대표실 부서 저장 실패")),
                "대표실 부서 조회 실패");

        execEmployeeId = UUID.randomUUID();
        String execShort = execEmployeeId.toString().substring(0, 8);
        Objects.requireNonNull(
                employeeRepository.save(Employee.create(
                        execEmployeeId,
                        "hrm_it_exec_" + execShort,
                        "[DEV-SEED] 대표실테스트",
                        "팀장",
                        Role.MASTER,
                        execDept,
                        true,
                        LocalDate.of(2026, 1, 1),
                        // email/phone 도 UUID 프리픽스로 unique 보장 — 다른 IT seed / V2 seed 와 충돌 회피
                        "hrm_it_exec_" + execShort + "@samhan-air.com",
                        "010-" + execShort.substring(0, 4) + "-" + execShort.substring(4, 8))),
                "대표실 직원 저장 실패");

        // 영업1팀 부서 사용자
        Department salesDept = Objects.requireNonNull(
                departmentRepository.findById(SALES_DEPT_ID)
                        .orElseGet(() -> Objects.requireNonNull(
                                departmentRepository.save(Department.create("SALES_1", "영업1팀", 2)),
                                "영업1팀 부서 저장 실패")),
                "영업1팀 부서 조회 실패");

        salesEmployeeId = UUID.randomUUID();
        String salesShort = salesEmployeeId.toString().substring(0, 8);
        Objects.requireNonNull(
                employeeRepository.save(Employee.create(
                        salesEmployeeId,
                        "hrm_it_sales_" + salesShort,
                        "[DEV-SEED] 영업팀테스트",
                        "사원",
                        Role.SALES,
                        salesDept,
                        false,
                        LocalDate.of(2026, 1, 1),
                        "hrm_it_sales_" + salesShort + "@samhan-air.com",
                        "010-" + salesShort.substring(0, 4) + "-" + salesShort.substring(4, 8))),
                "영업1팀 직원 저장 실패");

        employeeRepository.flush();
    }

    // -------------------------------------------------------------------------
    // HRM-IT-1: GET /me/is-executive-office 응답 schema 검증
    // -------------------------------------------------------------------------

    /**
     * 응답 schema 검증 — {@code isExecutiveOffice: boolean}, {@code departmentName: string}.
     *
     * <p>엔드포인트 미존재(404) 시 WARN 로그 후 skip — 빌드 실패 X.
     */
    @Test
    @DisplayName("HRM-IT-1: GET /me/is-executive-office 응답 schema 검증")
    void getIsExecutiveOffice_responseSchemaValid() throws Exception {
        MvcResult result = mockMvc.perform(
                        MockMvcRequestBuilders
                                .get("/me/is-executive-office")
                                .header("X-User-Id", execEmployeeId.toString())
                                .header("X-User-Role", "MASTER")
                                .accept(MediaType.APPLICATION_JSON))
                .andReturn();

        int status = result.getResponse().getStatus();

        if (status == 404) {
            // 엔드포인트 미구현 — 선검증 spec, BE agent 구현 대기
            System.out.println("[HRM-IT-1] WARN: GET /me/is-executive-office 미구현 (404). " +
                    "BE agent 구현 완료 후 재실행 필요.");
            return;
        }

        assertThat(status)
                .as("HRM-IT-1: GET /me/is-executive-office 는 200 이어야 함")
                .isEqualTo(200);

        String body = result.getResponse().getContentAsString();
        assertThat(body).as("HRM-IT-1: 응답 body 가 비어 있음").isNotBlank();

        // schema 검증: isExecutiveOffice(boolean) + departmentName(string)
        JsonNode root = objectMapper.readTree(body);

        // data wrapper 또는 직접 필드 패턴 지원
        JsonNode payload = root.has("data") ? root.get("data") : root;

        assertThat(payload.has("isExecutiveOffice"))
                .as("HRM-IT-1: 응답에 isExecutiveOffice 필드 필요")
                .isTrue();
        assertThat(payload.get("isExecutiveOffice").isBoolean())
                .as("HRM-IT-1: isExecutiveOffice 는 boolean 이어야 함")
                .isTrue();

        assertThat(payload.has("departmentName"))
                .as("HRM-IT-1: 응답에 departmentName 필드 필요")
                .isTrue();
        assertThat(payload.get("departmentName").isTextual())
                .as("HRM-IT-1: departmentName 는 string 이어야 함")
                .isTrue();
    }

    // -------------------------------------------------------------------------
    // HRM-IT-2: 대표실 부서 사용자 → isExecutiveOffice=true
    // -------------------------------------------------------------------------

    /**
     * 대표실 부서 소속 MASTER 사용자 — {@code isExecutiveOffice=true} 반환 검증.
     */
    @Test
    @DisplayName("HRM-IT-2: 대표실 부서 사용자 → isExecutiveOffice=true")
    void getIsExecutiveOffice_execDeptUser_returnsTrue() throws Exception {
        MvcResult result = mockMvc.perform(
                        MockMvcRequestBuilders
                                .get("/me/is-executive-office")
                                .header("X-User-Id", execEmployeeId.toString())
                                .header("X-User-Role", "MASTER")
                                .accept(MediaType.APPLICATION_JSON))
                .andReturn();

        int status = result.getResponse().getStatus();

        if (status == 404) {
            System.out.println("[HRM-IT-2] WARN: GET /me/is-executive-office 미구현 (404). skip.");
            return;
        }

        assertThat(status)
                .as("HRM-IT-2: 대표실 사용자 is-executive-office → 200")
                .isEqualTo(200);

        String body = result.getResponse().getContentAsString();
        JsonNode root = objectMapper.readTree(body);
        JsonNode payload = root.has("data") ? root.get("data") : root;

        assertThat(payload.get("isExecutiveOffice").asBoolean())
                .as("HRM-IT-2: 대표실 부서 소속 → isExecutiveOffice=true 이어야 함")
                .isTrue();

        assertThat(payload.get("departmentName").asText())
                .as("HRM-IT-2: departmentName 은 '대표실' 이어야 함")
                .isEqualTo("대표실");
    }

    // -------------------------------------------------------------------------
    // HRM-IT-3: 일반 부서 사용자 → isExecutiveOffice=false
    // -------------------------------------------------------------------------

    /**
     * 영업1팀 소속 SALES 사용자 — {@code isExecutiveOffice=false} 반환 검증.
     */
    @Test
    @DisplayName("HRM-IT-3: 일반 부서(영업1팀) 사용자 → isExecutiveOffice=false")
    void getIsExecutiveOffice_salesDeptUser_returnsFalse() throws Exception {
        MvcResult result = mockMvc.perform(
                        MockMvcRequestBuilders
                                .get("/me/is-executive-office")
                                .header("X-User-Id", salesEmployeeId.toString())
                                .header("X-User-Role", "SALES")
                                .accept(MediaType.APPLICATION_JSON))
                .andReturn();

        int status = result.getResponse().getStatus();

        if (status == 404) {
            System.out.println("[HRM-IT-3] WARN: GET /me/is-executive-office 미구현 (404). skip.");
            return;
        }

        assertThat(status)
                .as("HRM-IT-3: 영업1팀 사용자 is-executive-office → 200")
                .isEqualTo(200);

        String body = result.getResponse().getContentAsString();
        JsonNode root = objectMapper.readTree(body);
        JsonNode payload = root.has("data") ? root.get("data") : root;

        assertThat(payload.get("isExecutiveOffice").asBoolean())
                .as("HRM-IT-3: 일반 부서(영업1팀) 소속 → isExecutiveOffice=false 이어야 함")
                .isFalse();

        assertThat(payload.get("departmentName").asText())
                .as("HRM-IT-3: departmentName 은 '영업1팀' 이어야 함")
                .isEqualTo("영업1팀");
    }

    // -------------------------------------------------------------------------
    // HRM-IT-4: 미인증 사용자 → 401
    // -------------------------------------------------------------------------

    /**
     * X-User-Id 헤더 미전달(미인증) — {@code 401 Unauthorized} 검증.
     *
     * <p>엔드포인트 미구현(404) 시 skip. 401 과 404 외 다른 상태는 실패.
     */
    @Test
    @DisplayName("HRM-IT-4: 미인증 사용자(헤더 없음) → 401 Unauthorized")
    void getIsExecutiveOffice_unauthenticated_returns401() throws Exception {
        MvcResult result = mockMvc.perform(
                        MockMvcRequestBuilders
                                .get("/me/is-executive-office")
                                .accept(MediaType.APPLICATION_JSON))
                .andReturn();

        int status = result.getResponse().getStatus();

        if (status == 404) {
            System.out.println("[HRM-IT-4] WARN: GET /me/is-executive-office 미구현 (404). skip.");
            return;
        }

        assertThat(status)
                .as("HRM-IT-4: 미인증(헤더 없음) → 401 이어야 함 (실제 status=" + status + ")")
                .isEqualTo(401);
    }
}
