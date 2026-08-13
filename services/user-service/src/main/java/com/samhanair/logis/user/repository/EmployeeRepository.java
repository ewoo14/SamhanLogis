package com.samhanair.logis.user.repository;

import com.samhanair.logis.common.security.Role;
import com.samhanair.logis.user.domain.Employee;
import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.lang.NonNull;

/**
 * Soft-delete is enforced at the entity level via @SQLRestriction on {@link Employee}.
 *
 * <p>W10-6 known-issues fix — 모든 Employee 반환 finder 에 {@code @EntityGraph(attributePaths = "department")}
 * 적용. Controller 직렬화 시점 ({@code EmployeeResponse.from()} → {@code e.getDepartment().getId()}) 은
 * Hibernate Session 종료 후이므로, LAZY proxy 그대로 두면 {@code LazyInitializationException}
 * (could not initialize proxy ... no Session) 발생. EntityGraph 로 fetch join 강제하여 직렬화
 * 시점 lazy 접근 자체를 제거 + N+1 회피.
 */
public interface EmployeeRepository extends JpaRepository<Employee, UUID> {

    boolean existsByLoginId(String loginId);

    /** 계정 연결 정합성 점검용 활성 직원 조회. 이름 비교는 서비스에서 정확히 수행한다. */
    @Query("SELECT e FROM Employee e LEFT JOIN FETCH e.department "
            + "WHERE e.isDeleted = false AND e.terminationDate IS NULL AND e.loginId IN :loginIds")
    List<Employee> findAllActiveByLoginIds(@Param("loginIds") Collection<String> loginIds);

    @Override
    @NonNull
    @EntityGraph(attributePaths = "department")
    List<Employee> findAll();

    @Override
    @NonNull
    @EntityGraph(attributePaths = "department")
    Optional<Employee> findById(@NonNull UUID id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select e from Employee e where e.id = :id")
    Optional<Employee> findByIdForUpdate(@Param("id") UUID id);

    @EntityGraph(attributePaths = "department")
    List<Employee> findAllByIdIn(Collection<UUID> ids);

    /** 메신저 발송 직전 재직 상태를 재검증한다. soft-delete와 퇴사자는 결과에서 제외한다. */
    @Query("SELECT e FROM Employee e LEFT JOIN FETCH e.department "
            + "WHERE e.id IN :ids AND e.terminationDate IS NULL")
    List<Employee> findAllActiveByIdIn(@Param("ids") Collection<UUID> ids);

    @EntityGraph(attributePaths = "department")
    List<Employee> findAllByDepartment_Id(UUID departmentId);

    @EntityGraph(attributePaths = "department")
    List<Employee> findAllByRoleSnapshot(Role role);

    @EntityGraph(attributePaths = "department")
    List<Employee> findAllByDepartment_IdAndRoleSnapshot(UUID departmentId, Role role);

    @EntityGraph(attributePaths = "department")
    List<Employee> findTop20ByFullName(String fullName);

    /** groupware 결재자 picker 용 internal 검색 — fullName/loginId 부분일치. */
    @Query("SELECT e FROM Employee e LEFT JOIN FETCH e.department "
            + "WHERE e.isDeleted = false "
            + "AND (LOWER(e.fullName) LIKE LOWER(CONCAT('%', :q, '%')) ESCAPE '\\' "
            + "   OR LOWER(e.loginId) LIKE LOWER(CONCAT('%', :q, '%')) ESCAPE '\\')")
    List<Employee> searchInternalApprovers(@Param("q") String q, Pageable pageable);

    /** 메신저 수신자 검색용 internal 조회 — soft-delete와 퇴사 직원을 제외한다. */
    @Query("SELECT e FROM Employee e LEFT JOIN FETCH e.department "
            + "WHERE e.isDeleted = false AND e.terminationDate IS NULL "
            + "AND (LOWER(e.fullName) LIKE LOWER(CONCAT('%', :q, '%')) ESCAPE '\\' "
            + "   OR LOWER(e.loginId) LIKE LOWER(CONCAT('%', :q, '%')) ESCAPE '\\')" )
    List<Employee> searchInternalActiveRecipients(@Param("q") String q, Pageable pageable);

    /**
     * 종합견적서 담당자 directory 조회 — 활성 직원의 이름만 검색한다.
     *
     * <p>활성 = soft-delete 제외(isDeleted=false) + 퇴사/비활성 제외(terminationDate IS NULL) —
     * searchAdmin 의 활성/LOCKED 정의와 정합. 퇴사·비활성(disable) 직원은 담당자 후보에서 제외한다.
     * 기존 groupware approver 검색과 달리 blank q 도 전체 목록을 반환해야 하므로 별도 query 로 둔다.
     */
    @Query("SELECT e FROM Employee e LEFT JOIN FETCH e.department "
            + "WHERE e.isDeleted = false AND e.terminationDate IS NULL "
            + "AND (CAST(:q AS string) IS NULL "
            + " OR LOWER(e.fullName) LIKE LOWER(CONCAT('%', CAST(:q AS string), '%')) ESCAPE '\\')")
    List<Employee> searchEmployeeDirectory(@Param("q") String q, Pageable pageable);

    /** #31 — estimate-app 접속 게이트 (legacy Notion AUTH DB 의 email 승인 조회 치환). */
    Optional<Employee> findByEmail(String email);

    @EntityGraph(attributePaths = "department")
    Optional<Employee> findByEcountCode(String ecountCode);

    /**
     * Phase 10 P0-5 — admin 사용자 목록 페이지 조회 (q / role / dept / status 필터).
     *
     * <p>q 는 fullName / loginId / email LIKE 부분 일치 (대소문자 무시). null/blank 시 필터 미적용.
     * role / departmentId / status 도 null 시 필터 미적용. 5 필터 조합 모두 본 query 1개로 처리.
     *
     * <p>status 값:
     * <ul>
     *   <li>{@code "ACTIVE"} — terminationDate IS NULL (활성)</li>
     *   <li>{@code "LOCKED"} — terminationDate IS NOT NULL (비활성/잠금)</li>
     *   <li>{@code null} — 필터 미적용 (전체)</li>
     * </ul>
     */
    // [RC4] :q 가 null 일 때 PostgreSQL 이 파라미터를 bytea 로 추론해 lower(bytea) 500 → CAST(:q AS string)
    // 으로 text 바인딩 강제. CAST(null AS string) IS NULL → true 로 null 분기(전체 조회) 동작.
    @Query("SELECT e FROM Employee e JOIN FETCH e.department d "
            + "WHERE (CAST(:q AS string) IS NULL OR LOWER(e.fullName) LIKE LOWER(CONCAT('%', CAST(:q AS string), '%')) ESCAPE '\\' "
            + "       OR LOWER(e.loginId) LIKE LOWER(CONCAT('%', CAST(:q AS string), '%')) ESCAPE '\\' "
            + "       OR LOWER(COALESCE(e.email, '')) LIKE LOWER(CONCAT('%', CAST(:q AS string), '%')) ESCAPE '\\') "
            + "AND (:role IS NULL OR e.roleSnapshot = :role) "
            + "AND (:departmentId IS NULL OR d.id = :departmentId) "
            + "AND (:status IS NULL "
            + "     OR (:status = 'ACTIVE' AND e.terminationDate IS NULL) "
            + "     OR (:status = 'LOCKED' AND e.terminationDate IS NOT NULL))")
    Page<Employee> searchAdmin(@Param("q") String q,
                                @Param("role") Role role,
                                @Param("departmentId") UUID departmentId,
                                @Param("status") String status,
                                Pageable pageable);
}
