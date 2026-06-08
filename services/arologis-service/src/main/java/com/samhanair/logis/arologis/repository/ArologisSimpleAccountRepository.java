package com.samhanair.logis.arologis.repository;

import com.samhanair.logis.arologis.domain.ArologisSimpleAccount;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** 아로로지스 간이 계정과목 저장소. code 는 화면 노출 업무 식별자이자 PK 이다. */
@Repository
public interface ArologisSimpleAccountRepository extends JpaRepository<ArologisSimpleAccount, String> {

    /** 코드로 활성 계정과목 조회. */
    Optional<ArologisSimpleAccount> findByCodeAndIsDeletedFalse(String code);

    /** 활성 + 사용가능 계정과목 목록 (표시 순서). */
    List<ArologisSimpleAccount> findAllByIsDeletedFalseAndActiveTrueOrderByDisplayOrderAscCodeAsc();

    /** 활성 계정과목 전체 목록 (표시 순서). */
    List<ArologisSimpleAccount> findAllByIsDeletedFalseOrderByDisplayOrderAscCodeAsc();
}
