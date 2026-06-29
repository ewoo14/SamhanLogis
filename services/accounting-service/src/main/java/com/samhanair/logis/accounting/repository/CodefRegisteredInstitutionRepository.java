package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.codef.CodefConnection;
import com.samhanair.logis.accounting.domain.codef.CodefRegisteredInstitution;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** CODEF 등록 기관 repository. */
public interface CodefRegisteredInstitutionRepository extends JpaRepository<CodefRegisteredInstitution, UUID> {

    /**
     * 특정 CODEF 연결의 활성 등록 기관 목록을 조회한다.
     *
     * @param connection CODEF 연결
     * @return 등록 기관 목록
     */
    List<CodefRegisteredInstitution> findByConnectionAndIsDeletedFalseOrderByRegisteredAtDesc(CodefConnection connection);
}
