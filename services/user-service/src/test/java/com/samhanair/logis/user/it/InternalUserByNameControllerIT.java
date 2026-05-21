package com.samhanair.logis.user.it;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.common.security.Role;
import com.samhanair.logis.user.UserServiceApplication;
import com.samhanair.logis.user.client.AuthClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
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
import org.springframework.test.web.servlet.MockMvc;

/** MIG-10 user-service internal Employee name lookup endpoint IT. */
@SpringBootTest(classes = UserServiceApplication.class)
@AutoConfigureMockMvc
class InternalUserByNameControllerIT extends AbstractPostgresIT {

    private static final String TOKEN = "test-internal-token";

    @Autowired private MockMvc mockMvc;
    @Autowired private DepartmentRepository departmentRepository;
    @Autowired private EmployeeRepository employeeRepository;

    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;
    @MockBean private AuthClient authClient;

    private Department department;

    @BeforeEach
    void setUp() {
        department = departmentRepository.findByCode("MIG10_IT")
                .orElseGet(() -> departmentRepository.save(Department.create("MIG10_IT", "MIG10 테스트팀", 900)));
    }

    @Test
    void 정상_매칭_1건_200_배열_1건() throws Exception {
        employee("mig10-one-" + UUID.randomUUID(), "MIG10단건");

        mockMvc.perform(get("/internal/users/by-name")
                        .header("X-Internal-Token", TOKEN)
                        .param("name", "MIG10단건"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].fullName").value("MIG10단건"));
    }

    @Test
    void 매칭_0건_200_빈배열() throws Exception {
        mockMvc.perform(get("/internal/users/by-name")
                        .header("X-Internal-Token", TOKEN)
                        .param("name", "MIG10미등록-" + UUID.randomUUID()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(0)));
    }

    @Test
    void 매칭_2건_200_다건배열() throws Exception {
        String name = "MIG10동명이인-" + UUID.randomUUID();
        employee("mig10-a-" + UUID.randomUUID(), name);
        employee("mig10-b-" + UUID.randomUUID(), name);

        mockMvc.perform(get("/internal/users/by-name")
                        .header("X-Internal-Token", TOKEN)
                        .param("name", name))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(2)));
    }

    @Test
    void blank_name_200_빈배열() throws Exception {
        mockMvc.perform(get("/internal/users/by-name")
                        .header("X-Internal-Token", TOKEN)
                        .param("name", "   "))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(0)));
    }

    @Test
    void X_Internal_Token_누락_403() throws Exception {
        mockMvc.perform(get("/internal/users/by-name")
                        .param("name", "MIG10단건"))
                .andExpect(status().isForbidden());
    }

    @Test
    void 토큰_불일치_401_또는_403() throws Exception {
        mockMvc.perform(get("/internal/users/by-name")
                        .header("X-Internal-Token", "wrong-token")
                        .param("name", "MIG10단건"))
                .andExpect(status().isUnauthorized());
    }

    private void employee(String loginId, String fullName) {
        employeeRepository.save(Employee.create(UUID.randomUUID(), loginId, fullName, "사원",
                Role.SALES, department, false, LocalDate.of(2026, 1, 1), null, null));
    }
}
