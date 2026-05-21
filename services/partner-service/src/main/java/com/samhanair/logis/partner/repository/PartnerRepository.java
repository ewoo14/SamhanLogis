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
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** 거래처 마스터 저장소 — partnerCode lookup (M5 의존성 해소) + 관리자 검색. */
@Repository
public interface PartnerRepository extends JpaRepository<Partner, UUID> {

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
            + "(:q IS NULL "
            + " OR LOWER(p.partnerCode) LIKE LOWER(CONCAT('%', :q, '%')) "
            + " OR LOWER(p.name) LIKE LOWER(CONCAT('%', :q, '%')) "
            + " OR LOWER(COALESCE(p.bizNo, '')) LIKE LOWER(CONCAT('%', :q, '%')) "
            + " OR LOWER(COALESCE(p.phone, '')) LIKE LOWER(CONCAT('%', :q, '%')) ) "
            + "AND (:status IS NULL OR p.status = :status)")
    Page<Partner> searchAdmin(@Param("q") String q,
                              @Param("status") PartnerStatus status,
                              Pageable pageable);
}
