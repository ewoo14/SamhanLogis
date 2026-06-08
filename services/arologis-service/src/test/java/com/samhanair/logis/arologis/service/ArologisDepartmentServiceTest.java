package com.samhanair.logis.arologis.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.arologis.domain.ArologisDepartment;
import com.samhanair.logis.arologis.repository.ArologisDepartmentRepository;
import com.samhanair.logis.arologis.repository.ArologisEmployeeRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** 아로로지스 부서 서비스 단위 검증. */
@ExtendWith(MockitoExtension.class)
class ArologisDepartmentServiceTest {

    @Mock private ArologisDepartmentRepository departmentRepository;
    @Mock private ArologisEmployeeRepository employeeRepository;

    private ArologisDepartmentService service;

    @BeforeEach
    void setUp() {
        service = new ArologisDepartmentService(departmentRepository, employeeRepository);
    }

    @Test
    void delete_rejectsDepartmentWithActiveEmployees() {
        ArologisDepartment department = ArologisDepartment.create("ADMIN", "행정", 10);
        when(departmentRepository.findByCodeAndIsDeletedFalse("ADMIN")).thenReturn(Optional.of(department));
        when(employeeRepository.existsByDepartmentAndIsDeletedFalse(department)).thenReturn(true);

        assertThatThrownBy(() -> service.delete("ADMIN", "tester"))
                .isInstanceOf(BusinessException.class)
                .hasMessage("배속 직원이 있어 삭제할 수 없습니다")
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.CONFLICT);

        verify(departmentRepository, never()).delete(department);
    }
}
