package com.samhanair.logis.inventory.repository;

import com.samhanair.logis.inventory.domain.DpsProgramType;
import com.samhanair.logis.inventory.domain.DpsSaveHistory;
import com.samhanair.logis.inventory.domain.DpsSaveMode;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

/**
 * DPS 저장내역 repository.
 *
 * <p>entity 의 {@code @SQLRestriction("is_deleted = false")} 로 soft-deleted row 는 기본 조회에서
 * 제외된다. 사용자 격리는 모든 query 에 {@code createdBy} 조건을 포함해 강제한다.
 */
public interface DpsSaveHistoryRepository extends JpaRepository<DpsSaveHistory, UUID>,
        JpaSpecificationExecutor<DpsSaveHistory> {

    /**
     * 사용자+프로그램의 활성 AUTO_LATEST 단건을 조회한다.
     *
     * @param createdBy 사용자 ID
     * @param programType 프로그램 구분
     * @return 활성 자동 저장내역
     */
    default Optional<DpsSaveHistory> findActiveAutoLatest(
            String createdBy,
            DpsProgramType programType) {
        return findFirstByCreatedByAndProgramTypeAndSaveModeOrderByCreatedAtDesc(
                createdBy, programType, DpsSaveMode.AUTO_LATEST);
    }

    /** 사용자+프로그램+mode 기준 최신 활성 row 를 조회한다. */
    Optional<DpsSaveHistory> findFirstByCreatedByAndProgramTypeAndSaveModeOrderByCreatedAtDesc(
            String createdBy,
            DpsProgramType programType,
            DpsSaveMode saveMode);

    /**
     * 저장내역 목록을 필터링한다.
     *
     * @param createdBy 사용자 ID
     * @param programType null 이면 전체 프로그램
     * @param saveMode null 이면 전체 mode
     * @param fromInclusive 생성일시 시작 포함
     * @param toExclusive 생성일시 종료 다음날 0시 미포함
     * @param pageable page/size/sort
     * @return payload 를 제외한 목록 매핑 대상 page
     */
    default Page<DpsSaveHistory> findByFilter(
            String createdBy,
            DpsProgramType programType,
            DpsSaveMode saveMode,
            LocalDateTime fromInclusive,
            LocalDateTime toExclusive,
            Pageable pageable) {
        Specification<DpsSaveHistory> spec = (root, query, cb) -> {
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

    /**
     * 활성 저장내역을 ID 로 조회한다. createdBy 조건을 포함해 직접 UUID 접근을 차단한다.
     *
     * @param id 저장내역 ID
     * @param createdBy 사용자 ID
     * @return 사용자 소유 활성 저장내역
     */
    Optional<DpsSaveHistory> findByIdAndCreatedBy(UUID id, String createdBy);

    /**
     * 테스트와 race guard 확인용 활성 AUTO_LATEST 개수.
     *
     * @param createdBy 사용자 ID
     * @param programType 프로그램 구분
     * @return 활성 자동 저장 row 수
     */
    long countByCreatedByAndProgramTypeAndSaveMode(
            String createdBy,
            DpsProgramType programType,
            DpsSaveMode saveMode);

    /**
     * 테스트 가독성용 wrapper.
     *
     * @param createdBy 사용자 ID
     * @param programType 프로그램 구분
     * @return 활성 AUTO_LATEST 개수
     */
    default long countActiveAutoLatest(String createdBy, DpsProgramType programType) {
        return countByCreatedByAndProgramTypeAndSaveMode(
                createdBy, programType, DpsSaveMode.AUTO_LATEST);
    }
}
