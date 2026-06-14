package com.samhanair.logis.groupware.repository;

import com.samhanair.logis.groupware.domain.ApprovalTemplate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** 결재유형 템플릿 저장소. */
@Repository
public interface ApprovalTemplateRepository extends JpaRepository<ApprovalTemplate, UUID> {

    /** code 중복 검증/조회. */
    Optional<ApprovalTemplate> findByCode(String code);

    /** 관리자 목록 조회. */
    List<ApprovalTemplate> findAllByOrderByDisplayOrderAscNameAsc();

    /** 작성 화면 활성 템플릿 목록. */
    List<ApprovalTemplate> findAllByActiveTrueOrderByDisplayOrderAscNameAsc();
}
