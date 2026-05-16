package com.samhanair.logis.arologis.repository;

import com.samhanair.logis.arologis.domain.DispatchProgramType;
import com.samhanair.logis.arologis.domain.DispatchSaveHistory;
import com.samhanair.logis.arologis.domain.DispatchSaveMode;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

/**
 * 배차 저장내역 repository.
 *
 * <p>entity 의 {@code @SQLRestriction("is_deleted = false")} 로 soft-deleted row 는 기본 조회에서
 * 제외된다. 사용자 격리는 모든 query 에 {@code createdBy} 조건을 포함해 강제한다.
 */
public interface DispatchSaveHistoryRepository extends JpaRepository<DispatchSaveHistory, UUID>,
        JpaSpecificationExecutor<DispatchSaveHistory> {

    /** 사용자+프로그램의 활성 AUTO_LATEST 단건을 조회한다. */
    default Optional<DispatchSaveHistory> findActiveAutoLatest(
            String createdBy,
            DispatchProgramType programType) {
        return findFirstByCreatedByAndProgramTypeAndSaveModeOrderByCreatedAtDesc(
                createdBy, programType, DispatchSaveMode.AUTO_LATEST);
    }

    /** 사용자+프로그램+mode 기준 최신 활성 row 를 조회한다. */
    Optional<DispatchSaveHistory> findFirstByCreatedByAndProgramTypeAndSaveModeOrderByCreatedAtDesc(
            String createdBy,
            DispatchProgramType programType,
            DispatchSaveMode saveMode);

    /** 저장내역 목록을 필터링한다. */
    default Page<DispatchSaveHistory> findByFilter(
            String createdBy,
            DispatchProgramType programType,
            DispatchSaveMode saveMode,
            LocalDateTime fromInclusive,
            LocalDateTime toExclusive,
            Pageable pageable) {
        Specification<DispatchSaveHistory> spec = (root, query, cb) -> {
            var predicate = cb.equal(root.get("createdBy"), createdBy);
            if (programType != null) {
                predicate = cb.and(predicate, cb.equal(root.get("programType"), programType));
            }
            if (saveMode != null) {
                predicate = cb.and(predicate, cb.equal(root.get("saveMode"), saveMode));
            }
            if (fromInclusive != null) {
                predicate = cb.and(predicate,
                        cb.greaterThanOrEqualTo(root.get("createdAt"), fromInclusive));
            }
            if (toExclusive != null) {
                predicate = cb.and(predicate, cb.lessThan(root.get("createdAt"), toExclusive));
            }
            return predicate;
        };
        return findAll(spec, pageable);
    }

    /** 활성 저장내역을 ID + 사용자로 조회해 직접 UUID 접근을 차단한다. */
    Optional<DispatchSaveHistory> findByIdAndCreatedBy(UUID id, String createdBy);

    /** 테스트와 race guard 확인용 활성 AUTO_LATEST 개수. */
    long countByCreatedByAndProgramTypeAndSaveMode(
            String createdBy,
            DispatchProgramType programType,
            DispatchSaveMode saveMode);

    /** 테스트 가독성용 wrapper. */
    default long countActiveAutoLatest(String createdBy, DispatchProgramType programType) {
        return countByCreatedByAndProgramTypeAndSaveMode(
                createdBy, programType, DispatchSaveMode.AUTO_LATEST);
    }
}
