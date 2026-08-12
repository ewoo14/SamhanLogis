package com.samhanair.logis.user.it;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.common.security.Role;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.user.UserServiceApplication;
import com.samhanair.logis.user.client.AuthClient;
import com.samhanair.logis.user.domain.Department;
import com.samhanair.logis.user.domain.Employee;
import com.samhanair.logis.user.repository.DepartmentRepository;
import com.samhanair.logis.user.repository.EmployeeRepository;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.util.ReflectionTestUtils;

/** 그룹웨어 결재자 picker 용 internal 직원 검색 endpoint IT. */
@SpringBootTest(classes = UserServiceApplication.class)
@AutoConfigureMockMvc
class InternalUserSearchControllerIT extends AbstractPostgresIT {

    private static final String TOKEN = "test-internal-token";

    @Autowired private MockMvc mockMvc;
    @Autowired private DepartmentRepository departmentRepository;
    @Autowired private EmployeeRepository employeeRepository;

    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class)
    private DynamicPermissionClient dynamicPermissionClient;
    @MockBean private AuthClient authClient;

    private Department department;

    @BeforeEach
    void setUp() {
        department = departmentRepository.findByCode("APPROVER_SEARCH_IT")
                .orElseGet(() -> departmentRepository.save(
                        Department.create("APPROVER_SEARCH_IT", "결재검색팀", 901)));
    }

    @Test
    void fullName_부분일치_대소문자무시로_활성_사원을_검색한다() throws Exception {
        UUID userId = employee("approver-name-" + UUID.randomUUID(), "Alpha결재자", Role.MANAGER);

        mockMvc.perform(get("/internal/users/search")
                        .header("X-Internal-Token", TOKEN)
                        .param("q", "alpha")
                        .param("limit", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].userId").value(userId.toString()))
                .andExpect(jsonPath("$.data[0].fullName").value("Alpha결재자"))
                .andExpect(jsonPath("$.data[0].departmentName").value("결재검색팀"))
                .andExpect(jsonPath("$.data[0].role").value("MANAGER"));
    }

    @Test
    void approver_recipient_directory_검색의_wildcard는_문자열로만_매칭한다() throws Exception {
        UUID approver = employee("approver-luna-literal-" + shortToken(), "APP% 결재자", Role.MANAGER);
        employee("approver-luna-sibling-" + shortToken(), "APPX 결재자", Role.MANAGER);
        UUID recipient = employee("recipient-luna-literal-" + shortToken(), "REC% 수신자", Role.SALES);
        employee("recipient-luna-sibling-" + shortToken(), "RECX 수신자", Role.SALES);
        UUID directory = employeeWithEcount("directory-luna-literal-" + shortToken(),
                "DIR% 담당자", Role.MANAGER, "EMP-LUNA");
        employeeWithEcount("directory-luna-sibling-" + shortToken(),
                "DIRX 담당자", Role.MANAGER, "EMP-LUNAX");

        org.assertj.core.api.Assertions.assertThat(
                employeeRepository.searchInternalApprovers("APP\\%", org.springframework.data.domain.PageRequest.of(0, 20)))
                .extracting(Employee::getFullName)
                .containsExactly("APP% 결재자");

        mockMvc.perform(get("/internal/users/search")
                        .header("X-Internal-Token", TOKEN)
                        .param("q", "APP%"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].userId").value(approver.toString()));

        mockMvc.perform(get("/internal/users/search")
                        .header("X-Internal-Token", TOKEN)
                        .param("q", "REC%")
                        .param("activeOnly", "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].userId").value(recipient.toString()));

        mockMvc.perform(get("/internal/users/employees")
                        .header("X-Internal-Token", TOKEN)
                        .param("q", "DIR%"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].userId").value(directory.toString()));
    }

    @Test
    void loginId_부분일치로_검색하고_limit을_적용한다() throws Exception {
        String marker = "lim-" + shortToken();
        employee("approver-" + marker + "-a", "제한A", Role.SALES);
        employee("approver-" + marker + "-b", "제한B", Role.SALES);
        employee("approver-" + marker + "-c", "제한C", Role.SALES);

        mockMvc.perform(get("/internal/users/search")
                        .header("X-Internal-Token", TOKEN)
                        .param("q", marker)
                        .param("limit", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(2)));
    }

    @Test
    void soft_delete_사원은_검색에서_제외한다() throws Exception {
        String marker = "del-" + shortToken();
        Employee employee = employeeEntity("approver-" + marker, "삭제결재자", Role.SALES);
        employee.markDeleted("it");
        employeeRepository.saveAndFlush(employee);

        mockMvc.perform(get("/internal/users/search")
                        .header("X-Internal-Token", TOKEN)
                        .param("q", marker))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(0)));
    }

    @Test
    void M7_search_결과에_담당자코드를_포함한다() throws Exception {
        String marker = "코드결재자-" + shortToken();
        UUID userId = employeeWithEcount("approver-ecount-" + shortToken(), marker, Role.MANAGER, "EMP-7007");

        mockMvc.perform(get("/internal/users/search")
                        .header("X-Internal-Token", TOKEN)
                        .param("q", marker)
                        .param("limit", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].userId").value(userId.toString()))
                .andExpect(jsonPath("$.data[0].ecountCode").value("EMP-7007"));
    }

    @Test
    void 단건_internal_직원조회도_부서와_사번을_반환한다_RED() throws Exception {
        UUID userId = employeeWithEcount("profile-" + shortToken(), "프로필직원", Role.SALES, "EMP-PROFILE");

        mockMvc.perform(get("/internal/users/" + userId)
                        .header("X-Internal-Token", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.fullName").value("프로필직원"))
                .andExpect(jsonPath("$.data.departmentName").value("결재검색팀"))
                .andExpect(jsonPath("$.data.ecountCode").value("EMP-PROFILE"));
    }

    @Test
    void R10_activeOnly_true이면_퇴사자를_수신자_검색에서_제외한다() throws Exception {
        String marker = "terminated-recipient-" + shortToken();
        Employee terminated = employeeEntity("terminated-" + shortToken(), marker, Role.SALES);
        ReflectionTestUtils.setField(terminated, "terminationDate", LocalDate.of(2026, 3, 1));
        employeeRepository.saveAndFlush(terminated);

        mockMvc.perform(get("/internal/users/search")
                        .header("X-Internal-Token", TOKEN)
                        .param("q", marker)
                        .param("activeOnly", "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(0)));
    }

    @Test
    void verify_active_bulk는_현직만_true로_반환한다() throws Exception {
        UUID active = employee("active-bulk-" + shortToken(), "현직벌크", Role.SALES);
        Employee terminated = employeeEntity("terminated-bulk-" + shortToken(), "퇴사벌크", Role.SALES);
        ReflectionTestUtils.setField(terminated, "terminationDate", LocalDate.of(2026, 3, 1));
        UUID terminatedId = employeeRepository.saveAndFlush(terminated).getId();
        UUID missing = UUID.randomUUID();

        mockMvc.perform(post("/internal/users/verify-active-bulk")
                        .header("X-Internal-Token", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"userIds":["%s","%s","%s"]}
                                """.formatted(active, terminatedId, missing)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.exists['%s']".formatted(active)).value(true))
                .andExpect(jsonPath("$.data.exists['%s']".formatted(terminatedId)).value(false))
                .andExpect(jsonPath("$.data.exists['%s']".formatted(missing)).value(false));
    }

    @Test
    void displayNames_다건조회는_id별_fullName_map을_반환한다() throws Exception {
        UUID user1 = employee("display-" + shortToken() + "-a", "표시명A", Role.MANAGER);
        UUID user2 = employee("display-" + shortToken() + "-b", "표시명B", Role.SALES);
        UUID missing = UUID.randomUUID();

        mockMvc.perform(post("/internal/users/display-names")
                        .header("X-Internal-Token", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"userIds":["%s","%s","%s","%s"]}
                                """.formatted(user1, user2, user1, missing)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data['%s']".formatted(user1)).value("표시명A"))
                .andExpect(jsonPath("$.data['%s']".formatted(user2)).value("표시명B"))
                .andExpect(jsonPath("$.data['%s']".formatted(missing)).doesNotExist());
    }

    @Test
    void blank_q는_빈배열을_반환한다() throws Exception {
        mockMvc.perform(get("/internal/users/search")
                        .header("X-Internal-Token", TOKEN)
                        .param("q", "   "))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(0)));
    }

    @Test
    void X_Internal_Token_누락_403() throws Exception {
        mockMvc.perform(get("/internal/users/search")
                        .param("q", "Alpha"))
                .andExpect(status().isForbidden());
    }

    @Test
    void employees_토큰_누락_403() throws Exception {
        mockMvc.perform(get("/internal/users/employees"))
                .andExpect(status().isForbidden());
    }

    @Test
    void employees_토큰_불일치_401() throws Exception {
        mockMvc.perform(get("/internal/users/employees")
                        .header("X-Internal-Token", "wrong-token"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void employees_활성_행정직원_목록은_fullName_ecountCode_departmentName을_반환한다() throws Exception {
        String marker = "견적담당-" + shortToken();
        UUID userId = employeeWithEcount("estimate-" + shortToken(), marker, Role.MANAGER, "EMP-9001");

        mockMvc.perform(get("/internal/users/employees")
                        .header("X-Internal-Token", TOKEN)
                        .param("q", marker)
                        .param("limit", "500"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].userId").value(userId.toString()))
                .andExpect(jsonPath("$.data[0].fullName").value(marker))
                .andExpect(jsonPath("$.data[0].ecountCode").value("EMP-9001"))
                .andExpect(jsonPath("$.data[0].departmentName").value("결재검색팀"));
    }

    @Test
    void employees_soft_delete_및_퇴사_비활성_직원은_제외한다() throws Exception {
        String marker = "dir-inact-" + shortToken();
        // 활성 1명 (반환 대상)
        employeeWithEcount("active-" + shortToken(), marker + "-active", Role.SALES, "EMP-AC1");
        // soft-delete 1명 (제외)
        Employee deleted = employeeEntity("deleted-" + shortToken(), marker + "-deleted", Role.SALES);
        deleted.markDeleted("it");
        employeeRepository.saveAndFlush(deleted);
        // 퇴사/비활성(terminationDate) 1명 (제외)
        Employee terminated = employeeEntity("terminated-" + shortToken(), marker + "-terminated", Role.SALES);
        ReflectionTestUtils.setField(terminated, "terminationDate", LocalDate.of(2026, 3, 1));
        employeeRepository.saveAndFlush(terminated);

        mockMvc.perform(get("/internal/users/employees")
                        .header("X-Internal-Token", TOKEN)
                        .param("q", marker))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(1)));
    }

    private UUID employee(String loginId, String fullName, Role role) {
        return employeeRepository.saveAndFlush(employeeEntity(loginId, fullName, role)).getId();
    }

    private UUID employeeWithEcount(String loginId, String fullName, Role role, String ecountCode) {
        Employee employee = employeeEntity(loginId, fullName, role);
        ReflectionTestUtils.setField(employee, "ecountCode", ecountCode);
        return employeeRepository.saveAndFlush(employee).getId();
    }

    private Employee employeeEntity(String loginId, String fullName, Role role) {
        return Employee.create(UUID.randomUUID(), loginId, fullName, "사원",
                role, department, false, LocalDate.of(2026, 1, 1), null, null);
    }

    private String shortToken() {
        return UUID.randomUUID().toString().substring(0, 8);
    }
}
