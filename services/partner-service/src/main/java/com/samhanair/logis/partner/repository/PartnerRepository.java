package com.samhanair.logis.partner.repository;

import com.samhanair.logis.partner.domain.Partner;
import com.samhanair.logis.partner.domain.PartnerStatus;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/** 거래처 마스터 저장소 — partnerCode lookup (M5 의존성 해소) + 관리자 검색. */
@Repository
public interface PartnerRepository extends JpaRepository<Partner, UUID> {

    /** 이카운트 이관의 등록일자를 created_at에 보존한다 (partner 전용, 감사 전역 동작 비변경). */
    @Transactional
    @Modifying(flushAutomatically = true)
    @Query(value = "UPDATE partners SET created_at = :createdAt WHERE id = :partnerId", nativeQuery = true)
    int overrideCreatedAtForImport(@Param("partnerId") UUID partnerId,
                                   @Param("createdAt") java.time.LocalDateTime createdAt);

    /** 거래처 코드 lookup — slip-service /internal/partners/{partnerCode} 호출의 핵심 query. */
    Optional<Partner> findByPartnerCode(String partnerCode);

    /** 거래처 코드 중복 검사 — Stage 1 PartnerSeeder idempotency 가드. */
    boolean existsByPartnerCode(String partnerCode);

    /**
     * 거래처 코드 bulk lookup — Phase 9 W5 신규 (D-P9-16).
     *
     * <p>dashboard-service 의 매출 집계 화면 등에서 partnerCode N건 동시 조회 시 직렬 RPC N회 → 1회 batch
     * 호출 전환의 backing query. Spring Data JPA 가 {@code IN} 절을 자동 생성. 빈 컬렉션 호출 시
     * 빈 리스트 반환 (DB 조회 자체 회피는 service 계층 책임).
     */
    List<Partner> findAllByPartnerCodeIn(Collection<String> partnerCodes);

    /** partnerId bulk lookup — accounting-service admin 목록의 partnerName N+1 회피용. */
    List<Partner> findAllByIdIn(Collection<UUID> ids);

    /** 사업자번호 중복 검사 — 신규 등록 가드. */
    Optional<Partner> findByBizNo(String bizNo);

    /** 상태별 페이지 조회 (admin 검색). */
    Page<Partner> findAllByStatus(PartnerStatus status, Pageable pageable);

    /** 거래처명 부분 일치 검색 (admin 검색, 대소문자 무시). */
    List<Partner> findAllByNameContainingIgnoreCase(String namePart);

    /**
     * Phase 10 PR-D Part A — 거래처 상호 (이카운트 사업자명) 정확 일치 lookup.
     *
     * <p>BE-D ChatRoom 의 partner 매핑 + BLOCK 발송금지 CSV import 의 lookup 핵심 query.
     * Notion / 이카운트에서 export 된 거래처명은 partnerCode 가 아닌 상호 (name) 만 보유하므로
     * 본 메서드로 partnerCode 를 역추적한다. {@code @SQLRestriction("is_deleted = false")}
     * 이 활성 행만 자동 필터링하므로 메서드 시그니처에 별도 isDeleted 조건 불필요.
     *
     * @param name 거래처 상호 (예: "주식회사 삼성이엔지 (윤정희)")
     * @return 매칭된 활성 Partner 또는 empty
     */
    Optional<Partner> findByName(String name);

    /**
     * Phase 10 PR-D Part A — 거래처 상호 부분 일치 페이지 검색 (lookup fallback / autocomplete).
     *
     * <p>{@link #findByName(String)} 으로 정확 일치 미발견 시 LIKE 검색으로 fallback. Pageable
     * 로 결과 크기 제한 (lookup 용도는 size=2 로 다중결과 검출). 대소문자는 한국어이므로 의미 없음 —
     * 명시적 IgnoreCase 미적용 (한국어 + 영문 혼용 거래처명에 한해 IgnoreCase 적용은
     * {@link #findAllByNameContainingIgnoreCase(String)} 사용).
     *
     * @param keyword 부분 일치 검색어
     * @param pageable 페이지 크기 / 정렬
     * @return 매칭 페이지
     */
    Page<Partner> findAllByNameContaining(String keyword, Pageable pageable);

    /**
     * Phase 10 P0-5 — admin 거래처 목록 페이지 조회 (q / status 필터).
     *
     * <p>q 는 partnerCode / name / bizNo / phone LIKE 부분 일치. null/blank 시 q 필터 미적용.
     * status 필터도 null 시 미적용. UUID 비공개 가드 — 응답 변환은 controller 책임.
     */
    @Query("SELECT p FROM Partner p WHERE "
            + "(CAST(:q AS string) IS NULL "
            + " OR LOWER(p.partnerCode) LIKE LOWER(CONCAT('%', CAST(:q AS string), '%')) ESCAPE '\\' "
            + " OR LOWER(p.name) LIKE LOWER(CONCAT('%', CAST(:q AS string), '%')) ESCAPE '\\' "
            + " OR LOWER(COALESCE(p.bizNo, '')) LIKE LOWER(CONCAT('%', CAST(:q AS string), '%')) ESCAPE '\\' "
            + " OR LOWER(COALESCE(p.phone, '')) LIKE LOWER(CONCAT('%', CAST(:q AS string), '%')) ESCAPE '\\' ) "
            + "AND (:status IS NULL OR p.status = :status)")
    Page<Partner> searchAdmin(@Param("q") String q,
                              @Param("status") PartnerStatus status,
                              Pageable pageable);

    /**
     * soft-deleted row 를 포함한 admin 거래처 목록 검색.
     *
     * <p>{@code Partner} 의 {@code @SQLRestriction("is_deleted = false")} 우회를 위해 native query 를
     * 사용한다. E2 목록은 삭제행도 취소선으로 표시해야 하므로 admin list 는 본 경로를 사용한다.
     *
     * <p>⚠️ {@code status} 는 반드시 enum 의 <b>name() 문자열</b>("ACTIVE" 등)로 전달해야 한다.
     * native query 에 raw enum 을 바인딩하면 Hibernate 가 {@code @Enumerated(STRING)} 매핑과 무관하게
     * ordinal(정수)로 바인딩하여 {@code p.status = CAST(:status AS varchar)} 가 영구 불일치(0건) 하기 때문.
     * ({@code ProductRepository.search} 와 동일 패턴.)
     */
    @Query(value = """
            SELECT *
              FROM partners p
             WHERE (CAST(:q AS varchar) IS NULL
                    OR LOWER(p.partner_code) LIKE LOWER(CONCAT('%', CAST(:q AS varchar), '%')) ESCAPE E'\\\\'
                    OR LOWER(p.name) LIKE LOWER(CONCAT('%', CAST(:q AS varchar), '%')) ESCAPE E'\\\\'
                    OR LOWER(COALESCE(p.biz_no, '')) LIKE LOWER(CONCAT('%', CAST(:q AS varchar), '%')) ESCAPE E'\\\\'
                    OR LOWER(COALESCE(p.phone, '')) LIKE LOWER(CONCAT('%', CAST(:q AS varchar), '%')) ESCAPE E'\\\\')
               AND (CAST(:status AS varchar) IS NULL OR p.status = CAST(:status AS varchar))
             ORDER BY p.partner_code ASC
            """,
            countQuery = """
            SELECT COUNT(*)
              FROM partners p
             WHERE (CAST(:q AS varchar) IS NULL
                    OR LOWER(p.partner_code) LIKE LOWER(CONCAT('%', CAST(:q AS varchar), '%')) ESCAPE E'\\\\'
                    OR LOWER(p.name) LIKE LOWER(CONCAT('%', CAST(:q AS varchar), '%')) ESCAPE E'\\\\'
                    OR LOWER(COALESCE(p.biz_no, '')) LIKE LOWER(CONCAT('%', CAST(:q AS varchar), '%')) ESCAPE E'\\\\'
                    OR LOWER(COALESCE(p.phone, '')) LIKE LOWER(CONCAT('%', CAST(:q AS varchar), '%')) ESCAPE E'\\\\')
               AND (CAST(:status AS varchar) IS NULL OR p.status = CAST(:status AS varchar))
            """,
            nativeQuery = true)
    Page<Partner> searchAdminIncludingDeleted(@Param("q") String q,
                                              @Param("status") String status,
                                              Pageable pageable);

    /**
     * soft-deleted row 를 포함해 거래처 코드로 조회한다.
     *
     * <p>삭제행 복원은 {@code @SQLRestriction} 우회 로드가 필요하다.
     *
     * <p>partial unique index 는 <b>활성</b> 행의 partnerCode 중복만 막으므로, 삭제 후 코드 재사용 시
     * 동일 partnerCode 의 (삭제행 + 활성행) 복수 행이 존재할 수 있다. 복원 대상은 삭제행이므로
     * {@code is_deleted DESC}(삭제행 우선) + 최근 삭제 순 + {@code LIMIT 1} 로 단건을 결정론적으로 반환한다
     * (복수 반환 시 {@code IncorrectResultSizeDataAccessException} 500 방지).
     */
    @Query(value = "SELECT * FROM partners WHERE partner_code = :partnerCode "
            + "ORDER BY is_deleted DESC, deleted_at DESC NULLS LAST LIMIT 1", nativeQuery = true)
    Optional<Partner> findByPartnerCodeIncludingDeleted(@Param("partnerCode") String partnerCode);

    /**
     * 종합견적서 거래처 directory 조회 — ACTIVE 거래처만 name/bizNo/partnerCode 로 검색한다.
     *
     * <p>admin 검색과 달리 phone 은 검색 대상이 아니다. estimate-app 은 결과의 partnerCode/bizNo 로만
     * 거래처를 식별하고, UUID 는 내부 응답에만 포함된다.
     */
    @Query("SELECT p FROM Partner p WHERE p.status = com.samhanair.logis.partner.domain.PartnerStatus.ACTIVE "
            + "AND (CAST(:q AS string) IS NULL "
            + " OR LOWER(p.partnerCode) LIKE LOWER(CONCAT('%', CAST(:q AS string), '%')) ESCAPE '\\' "
            + " OR LOWER(p.name) LIKE LOWER(CONCAT('%', CAST(:q AS string), '%')) ESCAPE '\\' "
            + " OR LOWER(COALESCE(p.bizNo, '')) LIKE LOWER(CONCAT('%', CAST(:q AS string), '%')) ESCAPE '\\')")
    List<Partner> searchDirectory(@Param("q") String q, Pageable pageable);
}
