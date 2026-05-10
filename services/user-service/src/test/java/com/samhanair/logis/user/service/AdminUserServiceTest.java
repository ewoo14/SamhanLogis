package com.samhanair.logis.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.security.Role;
import com.samhanair.logis.user.client.AuthClient;
import com.samhanair.logis.user.domain.Department;
import com.samhanair.logis.user.domain.Employee;
import com.samhanair.logis.user.repository.DepartmentRepository;
import com.samhanair.logis.user.repository.EmployeeRepository;
import com.samhanair.logis.user.repository.RoleChangeHistoryRepository;
import com.samhanair.logis.user.web.dto.AdminUserCreateRequest;
import com.samhanair.logis.user.web.dto.AdminUserCreateResponse;
import com.samhanair.logis.user.web.dto.AdminUserUpdateRequest;
import com.samhanair.logis.user.web.dto.EmployeeResponse;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Phase 10 P0-5 신규 admin 메서드 단위 테스트 — 8 시나리오.
 *
 * <p>{@link EmployeeProvisioningService}의 admin 전용 메서드
 * ({@code adminCreate / adminUpdate / adminDisable / adminUnlock}) 를 검증.
 * 외부 의존 ({@link AuthClient} / Repository) 은 Mockito mock 으로 격리.
 *
 * <p>PR #134 회고 패턴: {@link MockitoSettings}(LENIENT) 적용하여
 * 미사용 stub 으로 인한 UnnecessaryStubbingException 방지.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AdminUserServiceTest {

    @Mock
    private EmployeeRepository employeeRepository;

    @Mock
    private DepartmentRepository departmentRepository;

    @Mock
    private RoleChangeHistoryRepository roleHistoryRepository;

    @Mock
    private AuthClient authClient;

    @Mock
    private TemporaryPasswordGenerator temporaryPasswordGenerator;

    @InjectMocks
    private EmployeeProvisioningService service;

    private Department salesDept;
    private UUID deptId;
    private UUID callerId;

    @BeforeEach
    void setUp() {
        salesDept = Department.create("SALES_1", "영업1팀", 1);
        deptId = UUID.randomUUID();
        ReflectionTestUtils.setField(salesDept, "id", deptId);
        callerId = UUID.randomUUID();

        // 임시 비밀번호 생성기 stub (모든 테스트 공통)
        when(temporaryPasswordGenerator.generate()).thenReturn("TmpPass01");
    }

    // -------------------------------------------------------------------------
    // 1. adminCreate — 정상 등록
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("adminCreate — 임시 비밀번호 자동 생성 + auth-service createAccount(passwordChangeRequired=true) 호출")
    void adminCreate_generatesTemporaryPassword_andCallsAuthWithFlag() {
        when(departmentRepository.findById(deptId)).thenReturn(Optional.of(salesDept));
        when(employeeRepository.save(any(Employee.class))).thenAnswer(inv -> inv.getArgument(0));

        AdminUserCreateRequest req = new AdminUserCreateRequest(
                "newuser01", "신입사원", "new@samhan.com", Role.SALES, deptId, "010-0000-0001");

        AdminUserCreateResponse resp = service.adminCreate(req, callerId);

        // 임시 비밀번호 포함 + passwordChangeRequired = true
        assertThat(resp.temporaryPassword()).isEqualTo("TmpPass01");
        assertThat(resp.passwordChangeRequired()).isTrue();
        assertThat(resp.loginId()).isEqualTo("newuser01");

        // auth-service 호출 시 passwordChangeRequired=true 전달 검증
        verify(authClient).createAccount(
                any(UUID.class), eq("newuser01"), eq("TmpPass01"),
                eq("신입사원"), eq(Role.SALES), eq(true));
    }

    // -------------------------------------------------------------------------
    // 2. adminCreate — 부서 미입력 시 기본 부서(GENERAL) fallback
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("adminCreate — departmentId null 시 GENERAL 코드 부서로 fallback")
    void adminCreate_nullDepartmentId_usesGeneralFallback() {
        Department generalDept = Department.create("GENERAL", "일반부서", 99);
        UUID generalId = UUID.randomUUID();
        ReflectionTestUtils.setField(generalDept, "id", generalId);

        when(departmentRepository.findByCode(EmployeeProvisioningService.DEFAULT_DEPARTMENT_CODE))
                .thenReturn(Optional.of(generalDept));
        when(employeeRepository.save(any(Employee.class))).thenAnswer(inv -> inv.getArgument(0));

        AdminUserCreateRequest req = new AdminUserCreateRequest(
                "newuser02", "신입사원2", null, Role.INVENTORY, null, null);

        AdminUserCreateResponse resp = service.adminCreate(req, callerId);

        assertThat(resp.departmentId()).isEqualTo(generalId);
        assertThat(resp.departmentName()).isEqualTo("일반부서");
    }

    // -------------------------------------------------------------------------
    // 3. adminCreate — auth-service 실패 시 보상 delete + 예외 전파
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("adminCreate — employeeRepository.save 실패 시 auth-service 보상 delete 호출")
    void adminCreate_persistFails_callsCompensationDelete() {
        when(departmentRepository.findById(deptId)).thenReturn(Optional.of(salesDept));
        when(employeeRepository.save(any(Employee.class)))
                .thenThrow(new RuntimeException("DB 장애"));

        AdminUserCreateRequest req = new AdminUserCreateRequest(
                "failuser", "실패직원", null, Role.SALES, deptId, null);

        ArgumentCaptor<UUID> createIdCaptor = ArgumentCaptor.forClass(UUID.class);
        ArgumentCaptor<UUID> deleteIdCaptor = ArgumentCaptor.forClass(UUID.class);

        assertThatThrownBy(() -> service.adminCreate(req, callerId))
                .isInstanceOf(RuntimeException.class)
                .hasMessage("DB 장애");

        verify(authClient).createAccount(createIdCaptor.capture(), any(), any(), any(), any(), anyBoolean());
        verify(authClient).delete(deleteIdCaptor.capture());
        assertThat(deleteIdCaptor.getValue()).isEqualTo(createIdCaptor.getValue());
    }

    // -------------------------------------------------------------------------
    // 4. adminCreate — loginId 중복 시 CONFLICT 예외
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("adminCreate — loginId 중복 시 CONFLICT 예외 전파 + employee 저장 없음")
    void adminCreate_duplicateLoginId_throwsConflict() {
        when(departmentRepository.findById(deptId)).thenReturn(Optional.of(salesDept));
        org.mockito.Mockito.doThrow(new BusinessException(ErrorCode.CONFLICT, "이미 사용중인 아이디입니다"))
                .when(authClient).createAccount(any(), any(), any(), any(), any(), anyBoolean());

        AdminUserCreateRequest req = new AdminUserCreateRequest(
                "dup01", "중복직원", null, Role.SALES, deptId, null);

        assertThatThrownBy(() -> service.adminCreate(req, callerId))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));

        verify(employeeRepository, never()).save(any());
    }

    // -------------------------------------------------------------------------
    // 5. adminUpdate — fullName 변경 시 auth displayName 동기화
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("adminUpdate — fullName 변경 시 auth-service updateDisplayName 호출")
    void adminUpdate_fullNameChanged_syncsAuthDisplayName() {
        Employee emp = anEmployee("기존이름");
        when(employeeRepository.findById(emp.getId())).thenReturn(Optional.of(emp));

        AdminUserUpdateRequest req = new AdminUserUpdateRequest(
                "새이름", null, null, null);
        EmployeeResponse resp = service.adminUpdate(emp.getId(), req, callerId);

        assertThat(resp.fullName()).isEqualTo("새이름");
        verify(authClient).updateDisplayName(emp.getId(), "새이름");
    }

    // -------------------------------------------------------------------------
    // 6. adminUpdate — fullName 동일 시 auth 미호출
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("adminUpdate — fullName 동일 시 auth-service updateDisplayName 미호출")
    void adminUpdate_fullNameUnchanged_doesNotCallAuth() {
        Employee emp = anEmployee("그대로");
        when(employeeRepository.findById(emp.getId())).thenReturn(Optional.of(emp));

        AdminUserUpdateRequest req = new AdminUserUpdateRequest(
                "그대로", "changed@samhan.com", null, null);
        service.adminUpdate(emp.getId(), req, callerId);

        verify(authClient, never()).updateDisplayName(any(), any());
    }

    // -------------------------------------------------------------------------
    // 7. adminDisable — soft-delete + auth disable 호출
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("adminDisable — employees soft-delete + auth-service disable 호출")
    void adminDisable_softDeletesEmployee_andCallsAuthDisable() {
        Employee emp = anEmployee("퇴사자");
        when(employeeRepository.findById(emp.getId())).thenReturn(Optional.of(emp));

        service.adminDisable(emp.getId(), callerId);

        assertThat(emp.getTerminationDate()).isEqualTo(LocalDate.now());
        assertThat(emp.getIsDeleted()).isTrue();
        verify(authClient).disable(emp.getId());
    }

    // -------------------------------------------------------------------------
    // 8. adminUnlock — auth-service unlock 호출
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("adminUnlock — 직원 존재 확인 후 auth-service unlock 호출")
    void adminUnlock_callsAuthUnlock() {
        Employee emp = anEmployee("잠긴직원");
        when(employeeRepository.findById(emp.getId())).thenReturn(Optional.of(emp));

        service.adminUnlock(emp.getId(), callerId);

        verify(authClient).unlock(emp.getId());
    }

    // -------------------------------------------------------------------------
    // helper
    // -------------------------------------------------------------------------

    private Employee anEmployee(String fullName) {
        return Employee.create(
                UUID.randomUUID(), "loginx", fullName, "사원",
                Role.SALES, salesDept, false, LocalDate.of(2026, 1, 1), null, null);
    }
}
