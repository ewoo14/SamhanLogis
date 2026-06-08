package com.samhanair.logis.arologis.repository;

import com.samhanair.logis.arologis.domain.ArologisDepartment;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** 아로로지스 부서 저장소. 활성 행은 {@code @SQLRestriction} 과 명시 finder 로 이중 가드한다. */
@Repository
public interface ArologisDepartmentRepository extends JpaRepository<ArologisDepartment, UUID> {

    /** 부서 코드로 활성 부서 조회. */
    Optional<ArologisDepartment> findByCodeAndIsDeletedFalse(String code);

    /** 화면 표시 순서 기준 활성 부서 목록. */
    List<ArologisDepartment> findAllByIsDeletedFalseOrderByDisplayOrderAscCodeAsc();

    /** 활성 부서 코드 중복 확인. */
    boolean existsByCodeAndIsDeletedFalse(String code);
}
