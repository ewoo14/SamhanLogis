package com.samhanair.logis.user.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.common.security.Role;
import com.samhanair.logis.user.domain.Department;
import com.samhanair.logis.user.domain.Employee;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.Set;
import org.junit.jupiter.api.Test;

class MessengerDirectoryServiceTest {

    private final MessengerDirectoryService service = new MessengerDirectoryService();

    @Test
    void sorts_known_job_titles_from_representative_to_staff() {
        List<Employee> result = service.sort(List.of(employee("사원"), employee("대표"), employee("부장")));

        assertThat(result).extracting(Employee::getPosition).containsExactly("대표", "부장", "사원");
    }

    @Test
    void keeps_unknown_job_titles_at_the_end_without_inventing_rank() {
        List<Employee> result = service.sort(List.of(employee("개발자"), employee("사원")));

        assertThat(result).extracting(Employee::getPosition).containsExactly("사원", "개발자");
    }

    @Test
    void active_directory_excludes_terminated_and_disabled_accounts() {
        Employee active = employee("사원");
        Employee terminated = employee("주임");
        terminated.terminate(LocalDate.of(2026, 1, 1));
        Employee disabled = employee("과장");

        assertThat(service.activeOnly(List.of(active, terminated, disabled), Set.of(active.getId())))
                .containsExactly(active);
    }

    private static Employee employee(String position) {
        Department department = Department.create("DEV", "개발팀", 1);
        return Employee.create(UUID.randomUUID(), "login-" + position, position, position, Role.STAFF,
                department, false, LocalDate.of(2026, 1, 1), null, null);
    }
}
