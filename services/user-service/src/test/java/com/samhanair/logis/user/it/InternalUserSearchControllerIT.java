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

    private UUID employee(String loginId, String fullName, Role role) {
        return employeeRepository.saveAndFlush(employeeEntity(loginId, fullName, role)).getId();
    }

    private Employee employeeEntity(String loginId, String fullName, Role role) {
        return Employee.create(UUID.randomUUID(), loginId, fullName, "사원",
                role, department, false, LocalDate.of(2026, 1, 1), null, null);
    }

    private String shortToken() {
        return UUID.randomUUID().toString().substring(0, 8);
    }
}
