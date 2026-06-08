package com.samhanair.logis.arologis.repository;

import com.samhanair.logis.arologis.domain.ArologisDepartment;
import com.samhanair.logis.arologis.domain.ArologisEmployee;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** 아로로지스 직원 저장소. loginId 는 화면 노출 업무 식별자로 사용한다. */
@Repository
public interface ArologisEmployeeRepository extends JpaRepository<ArologisEmployee, UUID> {

    /** loginId 로 활성 직원 조회. */
    Optional<ArologisEmployee> findByLoginIdAndIsDeletedFalse(String loginId);

    /** 활성 직원 loginId 중복 확인. */
    boolean existsByLoginIdAndIsDeletedFalse(String loginId);

    /** 활성 부서에 배속된 직원 존재 여부. 부서 삭제 가드에서 사용한다. */
    boolean existsByDepartmentAndIsDeletedFalse(ArologisDepartment department);

    /**
     * 부서 필터 현직 직원 목록.
     *
     * <p>퇴직 처리는 soft-delete 를 동반하므로 기본 JPA 조회에서는 퇴직자가 제외된다.
     */
    @Query("""
            select e
              from ArologisEmployee e
              join fetch e.department d
              join fetch e.adminUser u
             where (:departmentCode is null or d.code = :departmentCode)
               and e.terminationDate is null
             order by d.displayOrder asc, e.loginId asc
            """)
    List<ArologisEmployee> searchCurrent(@Param("departmentCode") String departmentCode);
}
