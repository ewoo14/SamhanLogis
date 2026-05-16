package com.samhanair.logis.notification.repository;

import com.samhanair.logis.notification.domain.DispatchSmsProgramType;
import com.samhanair.logis.notification.domain.DispatchSmsSaveHistory;
import com.samhanair.logis.notification.domain.DispatchSmsSaveMode;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

/**
 * 배차문자 저장내역 repository.
 *
 * <p>entity 의 {@code @SQLRestriction("is_deleted = false")} 로 soft-deleted row 는 기본 조회에서
 * 제외된다. 사용자 격리는 모든 query 에 {@code createdBy} 조건을 포함해 강제한다.
 */
public interface DispatchSmsSaveHistoryRepository
        extends JpaRepository<DispatchSmsSaveHistory, UUID>,
        JpaSpecificationExecutor<DispatchSmsSaveHistory> {

    /** 사용자+프로그램의 활성 AUTO_LATEST 단건을 조회한다. */
    default Optional<DispatchSmsSaveHistory> findActiveAutoLatest(
            String createdBy,
            DispatchSmsProgramType programType) {
        return findFirstByCreatedByAndProgramTypeAndSaveModeOrderByCreatedAtDesc(
                createdBy, programType, DispatchSmsSaveMode.AUTO_LATEST);
    }

    /** 사용자+프로그램+mode 기준 최신 활성 row 를 조회한다. */
    Optional<DispatchSmsSaveHistory> findFirstByCreatedByAndProgramTypeAndSaveModeOrderByCreatedAtDesc(
            String createdBy,
            DispatchSmsProgramType programType,
            DispatchSmsSaveMode saveMode);

    /** 저장내역 목록을 필터링한다. */
    default Page<DispatchSmsSaveHistory> findByFilter(
            String createdBy,
            DispatchSmsProgramType programType,
            DispatchSmsSaveMode saveMode,
            LocalDateTime fromInclusive,
            LocalDateTime toExclusive,
            Pageable pageable) {
        Specification<DispatchSmsSaveHistory> spec = (root, query, cb) -> {
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
    Optional<DispatchSmsSaveHistory> findByIdAndCreatedBy(UUID id, String createdBy);

    /** 테스트와 race guard 확인용 활성 AUTO_LATEST 개수. */
    long countByCreatedByAndProgramTypeAndSaveMode(
            String createdBy,
            DispatchSmsProgramType programType,
            DispatchSmsSaveMode saveMode);

    /** 테스트 가독성용 wrapper. */
    default long countActiveAutoLatest(String createdBy, DispatchSmsProgramType programType) {
        return countByCreatedByAndProgramTypeAndSaveMode(
                createdBy, programType, DispatchSmsSaveMode.AUTO_LATEST);
    }
}
