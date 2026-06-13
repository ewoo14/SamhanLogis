package com.samhanair.logis.groupware.repository;

import com.samhanair.logis.groupware.domain.ApprovalLine;
import com.samhanair.logis.groupware.domain.ApprovalStatus;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** 결재선 저장소 — 요청자 / 결재자 / 상태 검색. */
@Repository
public interface ApprovalLineRepository extends JpaRepository<ApprovalLine, UUID> {

    /** 단건 조회 — steps 컬렉션 fetch 강제 (LazyInit + N+1 회귀 방지). */
    @Override
    @EntityGraph(attributePaths = "steps")
    Optional<ApprovalLine> findById(UUID id);

    /** 협업 overlay 전용 flat 조회 — steps fetch/lock 없이 부모 단일 row 만 로드한다. */
    @Query("select a from ApprovalLine a where a.id = :id")
    Optional<ApprovalLine> findFlatById(@Param("id") UUID id);

    /** 요청자별 결재선 페이지 — 본인 결재선 inbox 조회. */
    @EntityGraph(attributePaths = "steps")
    Page<ApprovalLine> findAllByRequesterId(UUID requesterId, Pageable pageable);

    /** 상태별 페이지 — 관리자/감사용. */
    @EntityGraph(attributePaths = "steps")
    Page<ApprovalLine> findAllByStatus(ApprovalStatus status, Pageable pageable);

    /** 요청자 + 상태 필터 — 본인 미결 결재선 등. */
    @EntityGraph(attributePaths = "steps")
    List<ApprovalLine> findAllByRequesterIdAndStatus(UUID requesterId, ApprovalStatus status);
}
