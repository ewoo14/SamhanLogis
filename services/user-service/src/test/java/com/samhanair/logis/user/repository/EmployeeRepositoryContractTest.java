package com.samhanair.logis.user.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import org.junit.jupiter.api.Test;
import org.springframework.data.jpa.repository.EntityGraph;

class EmployeeRepositoryContractTest {

    @Test
    void findByEmail_fetchesDepartment_beforeControllerSerialization() throws NoSuchMethodException {
        Method method = EmployeeRepository.class.getMethod("findByEmail", String.class);
        EntityGraph graph = method.getAnnotation(EntityGraph.class);

        assertThat(graph).isNotNull();
        assertThat(graph.attributePaths()).containsExactly("department");
    }
}
