package com.samhanair.logis.slip.repository;

import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipSourceType;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.domain.SlipType;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.Collection;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Slip 헤더 — 단건/필터 페이지 조회. partial unique 는 {@code slip_type + slip_no} 컬럼에 적용.
 *
 * <p>PR-E1 BE-A0 신규: {@link JpaSpecificationExecutor} 추가 — 5 query param (date range / partner_code
 * / driver_phone like / region_group / status) 동적 조합용. 기존 named query 들은 유지 (회귀 가드).
 */
public interface SlipRepository extends JpaRepository<Slip, UUID>, JpaSpecificationExecutor<Slip> {

    /** 장기미발주 판정용 마지막 출고일 — UUID 없이 거래처코드로만 조회한다. */
    @Query("select max(s.slipDate) from Slip s "
            + "where s.partnerCode = :partnerCode and s.slipType = "
            + "com.samhanair.logis.slip.domain.SlipType.OUTBOUND and s.isDeleted = false")
    LocalDate findLastOutboundDateByPartnerCode(@Param("partnerCode") String partnerCode);

    /** 전표번호({@code yyyy/MM/dd-N}) 단건 조회. soft-delete 제외. 중복 가능성 때문에 신규 코드는 type 지정 조회 권장. */
    Optional<Slip> findBySlipNo(String slipNo);

    /** 전표 유형 + 전표번호 단건 조회. 판매/구매 번호 중복 허용 정책의 기본 조회 방식. */
    Optional<Slip> findBySlipTypeAndSlipNoAndIsDeletedFalse(SlipType slipType, String slipNo);

    /**
     * soft-deleted row 를 포함해 slipId 로 조회한다.
     *
     * <p>{@link org.hibernate.annotations.SQLRestriction} 우회가 필요하므로 native query 를 사용한다.
     */
    @Query(value = "SELECT * FROM slips WHERE id = :id", nativeQuery = true)
    Optional<Slip> findByIdIncludingDeleted(@Param("id") UUID id);

    /** Internal 스냅샷 조회용 — 전표와 라인 컬렉션을 같은 persistence context 에서 함께 읽는다. */
    @Query("SELECT DISTINCT s FROM Slip s LEFT JOIN FETCH s.lines WHERE s.id = :id")
    Optional<Slip> findByIdWithLines(@Param("id") UUID id);

    /** 상태별 페이지 조회. soft-delete 제외. */
    Page<Slip> findAllByStatusAndIsDeletedFalse(SlipStatus status, Pageable pageable);

    /** slipType 별 페이지 조회. soft-delete 제외. */
    Page<Slip> findAllBySlipTypeAndIsDeletedFalse(SlipType slipType, Pageable pageable);

    @EntityGraph(attributePaths = "lines")
    @org.springframework.data.jpa.repository.Query("""
            SELECT DISTINCT s FROM Slip s
            WHERE s.isDeleted = false
              AND s.slipType = :type
              AND s.slipDate BETWEEN :from AND :to
              AND (:partnerId IS NULL OR s.partnerId = :partnerId)
            ORDER BY s.slipDate DESC, s.seqNo DESC
            """)
    List<Slip> findByPeriodWithLines(
            @org.springframework.data.repository.query.Param("type") SlipType type,
            @org.springframework.data.repository.query.Param("from") LocalDate from,
            @org.springframework.data.repository.query.Param("to") LocalDate to,
            @org.springframework.data.repository.query.Param("partnerId") UUID partnerId);

    /**
     * 거래처별 원장 판매전표 read projection source.
     *
     * <p>기존 DPS용 {@code findByPeriodWithLines}와 분리된 추가 계약이다. 활성 OUTBOUND 중 호출자가
     * 넘긴 원장 포함 상태만 기간·거래처코드로 조회하고, {@code lines}를 함께 fetch한다.
     * 거래처 UUID는 외부 계약에 필요하지 않으므로 이 조회의 필터도 업무 식별자인 partnerCode를 사용한다.
     *
     * @param from 조회 시작일(포함)
     * @param to 조회 종료일(포함)
     * @param partnerCode 거래처코드, null이면 전체
     * @param statuses 원장 포함 상태
     * @return 전표와 품목을 함께 읽은 활성 판매전표
     */
    @EntityGraph(attributePaths = "lines")
    @org.springframework.data.jpa.repository.Query("""
            SELECT DISTINCT s FROM Slip s
            WHERE s.isDeleted = false
              AND s.slipType = com.samhanair.logis.slip.domain.SlipType.OUTBOUND
              AND s.status IN :statuses
              AND s.slipDate BETWEEN :from AND :to
              AND (:partnerCode IS NULL OR s.partnerCode = :partnerCode)
            ORDER BY s.slipDate DESC, s.seqNo DESC
            """)
    List<Slip> findPartnerLedgerSales(
            @org.springframework.data.repository.query.Param("from") LocalDate from,
            @org.springframework.data.repository.query.Param("to") LocalDate to,
            @org.springframework.data.repository.query.Param("partnerCode") String partnerCode,
            @org.springframework.data.repository.query.Param("statuses") Collection<SlipStatus> statuses);

    /** slipType + status 동시 필터 페이지. soft-delete 제외. */
    Page<Slip> findAllBySlipTypeAndStatusAndIsDeletedFalse(SlipType slipType, SlipStatus status, Pageable pageable);

    /** 커밋 상태이면서 거래처가 비어 있는 활성 legacy 전표를 cutover 보정 대상으로 조회한다. */
    List<Slip> findAllByStatusInAndPartnerIdIsNullAndIsDeletedFalse(Collection<SlipStatus> statuses);

    /** 거래처 보정 후 남은 커밋 상태의 partner_id null 위반 건수를 계산한다. */
    long countByStatusInAndPartnerIdIsNullAndIsDeletedFalse(Collection<SlipStatus> statuses);

    /**
     * 판매/구매조회 목록용 soft-delete 포함 검색.
     *
     * <p>status/slipType/deliveryTag 는 native query 에 enum 객체를 직접 바인딩하지 않고
     * 반드시 {@code name()} 문자열로 전달한다. raw enum 은 ordinal 로 바인딩될 수 있어
     * PostgreSQL varchar 비교가 0건이 되는 회귀를 만든다.
     */
    @Query(value = """
            SELECT *
              FROM slips s
             WHERE (CAST(:slipType AS varchar) IS NULL OR s.slip_type = CAST(:slipType AS varchar))
               AND (CAST(:status AS varchar) IS NULL OR s.status = CAST(:status AS varchar))
               AND s.slip_date BETWEEN :from AND :to
               AND (:deliveryTagsEmpty = TRUE OR s.delivery_tag IN (:deliveryTags))
               AND (CAST(:searchPartnerName AS varchar) IS NULL
                    OR LOWER(COALESCE(s.partner_name, '')) LIKE LOWER(CONCAT('%', CAST(:searchPartnerName AS varchar), '%')) ESCAPE E'\\\\')
               AND (CAST(:searchPartnerCode AS varchar) IS NULL
                    OR LOWER(COALESCE(s.partner_code, '')) LIKE LOWER(CONCAT('%', CAST(:searchPartnerCode AS varchar), '%')) ESCAPE E'\\\\')
               AND (CAST(:searchBusinessNumber AS varchar) IS NULL
                    OR LOWER(COALESCE(s.business_number, '')) LIKE LOWER(CONCAT('%', CAST(:searchBusinessNumber AS varchar), '%')) ESCAPE E'\\\\')
               AND (CAST(:searchSlipNo AS varchar) IS NULL
                    OR LOWER(s.slip_no) LIKE LOWER(CONCAT('%', CAST(:searchSlipNo AS varchar), '%')) ESCAPE E'\\\\')
               AND (CAST(:searchProjectName AS varchar) IS NULL
                    OR LOWER(COALESCE(s.project_name, '')) LIKE LOWER(CONCAT('%', CAST(:searchProjectName AS varchar), '%')) ESCAPE E'\\\\')
               AND (CAST(:searchDeliveryAddress AS varchar) IS NULL
                    OR LOWER(COALESCE(s.delivery_address, '')) LIKE LOWER(CONCAT('%', CAST(:searchDeliveryAddress AS varchar), '%')) ESCAPE E'\\\\')
               AND s.is_deleted = FALSE
             ORDER BY s.slip_date DESC, s.seq_no DESC
            """,
            countQuery = """
            SELECT COUNT(*)
              FROM slips s
             WHERE (CAST(:slipType AS varchar) IS NULL OR s.slip_type = CAST(:slipType AS varchar))
               AND (CAST(:status AS varchar) IS NULL OR s.status = CAST(:status AS varchar))
               AND s.slip_date BETWEEN :from AND :to
               AND (:deliveryTagsEmpty = TRUE OR s.delivery_tag IN (:deliveryTags))
               AND (CAST(:searchPartnerName AS varchar) IS NULL
                    OR LOWER(COALESCE(s.partner_name, '')) LIKE LOWER(CONCAT('%', CAST(:searchPartnerName AS varchar), '%')) ESCAPE E'\\\\')
               AND (CAST(:searchPartnerCode AS varchar) IS NULL
                    OR LOWER(COALESCE(s.partner_code, '')) LIKE LOWER(CONCAT('%', CAST(:searchPartnerCode AS varchar), '%')) ESCAPE E'\\\\')
               AND (CAST(:searchBusinessNumber AS varchar) IS NULL
                    OR LOWER(COALESCE(s.business_number, '')) LIKE LOWER(CONCAT('%', CAST(:searchBusinessNumber AS varchar), '%')) ESCAPE E'\\\\')
               AND (CAST(:searchSlipNo AS varchar) IS NULL
                    OR LOWER(s.slip_no) LIKE LOWER(CONCAT('%', CAST(:searchSlipNo AS varchar), '%')) ESCAPE E'\\\\')
               AND (CAST(:searchProjectName AS varchar) IS NULL
                    OR LOWER(COALESCE(s.project_name, '')) LIKE LOWER(CONCAT('%', CAST(:searchProjectName AS varchar), '%')) ESCAPE E'\\\\')
               AND (CAST(:searchDeliveryAddress AS varchar) IS NULL
                    OR LOWER(COALESCE(s.delivery_address, '')) LIKE LOWER(CONCAT('%', CAST(:searchDeliveryAddress AS varchar), '%')) ESCAPE E'\\\\')
               AND s.is_deleted = FALSE
            """,
            nativeQuery = true)
    Page<Slip> searchIncludingDeleted(
            @Param("slipType") String slipType,
            @Param("status") String status,
            @Param("from") java.time.LocalDate from,
            @Param("to") java.time.LocalDate to,
            @Param("deliveryTags") java.util.Collection<String> deliveryTags,
            @Param("deliveryTagsEmpty") boolean deliveryTagsEmpty,
            @Param("searchPartnerName") String searchPartnerName,
            @Param("searchPartnerCode") String searchPartnerCode,
            @Param("searchBusinessNumber") String searchBusinessNumber,
            @Param("searchSlipNo") String searchSlipNo,
            @Param("searchProjectName") String searchProjectName,
            @Param("searchDeliveryAddress") String searchDeliveryAddress,
            Pageable pageable);

    /**
     * 기존 {@code GET /slips} 목록용 soft-delete 포함 검색.
     *
     * <p>status/slipType/deliveryTag 는 native query 에 enum 객체를 직접 바인딩하지 않고
     * 반드시 {@code name()} 문자열로 전달한다. raw enum 은 ordinal 로 바인딩될 수 있어
     * PostgreSQL varchar 비교가 0건이 되는 회귀를 만든다.
     */
    @Query(value = """
            SELECT *
              FROM slips s
             WHERE (CAST(:slipType AS varchar) IS NULL OR s.slip_type = CAST(:slipType AS varchar))
               AND (CAST(:status AS varchar) IS NULL OR s.status = CAST(:status AS varchar))
               AND (CAST(:from AS date) IS NULL OR s.slip_date >= CAST(:from AS date))
               AND (CAST(:to AS date) IS NULL OR s.slip_date <= CAST(:to AS date))
               AND (CAST(:partnerCode AS varchar) IS NULL OR s.partner_code = CAST(:partnerCode AS varchar))
               AND (CAST(:driverPhone AS varchar) IS NULL
                    OR COALESCE(s.driver_phone, '') LIKE CONCAT('%', CAST(:driverPhone AS varchar), '%'))
               AND (:deliveryTagsEmpty = TRUE OR s.delivery_tag IN (:deliveryTags))
               AND (:includeDeleted = TRUE OR s.is_deleted = FALSE)
             ORDER BY s.slip_date DESC, s.seq_no DESC
            """,
            countQuery = """
            SELECT COUNT(*)
              FROM slips s
             WHERE (CAST(:slipType AS varchar) IS NULL OR s.slip_type = CAST(:slipType AS varchar))
               AND (CAST(:status AS varchar) IS NULL OR s.status = CAST(:status AS varchar))
               AND (CAST(:from AS date) IS NULL OR s.slip_date >= CAST(:from AS date))
               AND (CAST(:to AS date) IS NULL OR s.slip_date <= CAST(:to AS date))
               AND (CAST(:partnerCode AS varchar) IS NULL OR s.partner_code = CAST(:partnerCode AS varchar))
               AND (CAST(:driverPhone AS varchar) IS NULL
                    OR COALESCE(s.driver_phone, '') LIKE CONCAT('%', CAST(:driverPhone AS varchar), '%'))
               AND (:deliveryTagsEmpty = TRUE OR s.delivery_tag IN (:deliveryTags))
               AND (:includeDeleted = TRUE OR s.is_deleted = FALSE)
            """,
            nativeQuery = true)
    Page<Slip> listIncludingDeleted(
            @Param("includeDeleted") boolean includeDeleted,
            @Param("slipType") String slipType,
            @Param("status") String status,
            @Param("from") LocalDate from,
            @Param("to") LocalDate to,
            @Param("partnerCode") String partnerCode,
            @Param("driverPhone") String driverPhone,
            @Param("deliveryTags") java.util.Collection<String> deliveryTags,
            @Param("deliveryTagsEmpty") boolean deliveryTagsEmpty,
            Pageable pageable);

    /** 활성 전체 페이지. soft-delete 제외. */
    Page<Slip> findAllByIsDeletedFalse(Pageable pageable);

    /**
     * 접근 가능한 전표유형 범위 안에서 전표번호 또는 거래처명 키워드를 부분검색한다.
     *
     * <p>그룹웨어 결재 첨부 자동완성에서 사용한다. {@code slip_no} 또는
     * {@code partner_name} 에 대한 대소문자 무시 부분일치이며, 최근 전표가 먼저 오도록
     * {@code slipDate DESC, seqNo DESC} 로 정렬한다.
     *
     * @param q 전표번호 또는 거래처명 키워드
     * @param slipTypes 조회 허용 전표유형 목록
     * @param pageable limit 전용 페이지 요청
     * @return 매칭 활성 전표 목록
     */
    @EntityGraph(attributePaths = "lines")
    @org.springframework.data.jpa.repository.Query("""
            SELECT DISTINCT s FROM Slip s
            WHERE s.isDeleted = false
              AND s.slipType IN :slipTypes
              AND (
                    lower(s.slipNo) LIKE lower(concat('%', :q, '%'))
                    OR lower(coalesce(s.partnerName, '')) LIKE lower(concat('%', :q, '%'))
              )
            ORDER BY s.slipDate DESC, s.seqNo DESC
            """)
    List<Slip> searchByKeywordAndSlipTypeIn(
            @org.springframework.data.repository.query.Param("q") String q,
            @org.springframework.data.repository.query.Param("slipTypes") java.util.Collection<SlipType> slipTypes,
            Pageable pageable);

    // ---- Slice B (notification-slice-B) ----

    /**
     * 같은 driverPhone + slipDate 의 슬립 목록 — 자동 그룹화의 source.
     * 미배치 (deliveryBatchId IS NULL) 슬립만 반환할지 여부는 호출자 (DeliveryBatchService) 결정.
     */
    List<Slip> findAllByDriverPhoneAndSlipDateAndIsDeletedFalse(String driverPhone, LocalDate slipDate);

    /** 배차 상세/내역 조립용 slip 헤더 일괄 조회. */
    List<Slip> findAllByIdInAndIsDeletedFalse(java.util.Collection<UUID> ids);

    /** 타배송사 인쇄 데이터 조립용 slip + line 일괄 조회. */
    @EntityGraph(attributePaths = "lines")
    @org.springframework.data.jpa.repository.Query("""
            SELECT DISTINCT s FROM Slip s
            WHERE s.isDeleted = false
              AND s.id IN :ids
            """)
    List<Slip> findAllWithLinesByIdInAndIsDeletedFalse(
            @org.springframework.data.repository.query.Param("ids") java.util.Collection<UUID> ids);

    /**
     * 타배송사 SMS 발송 대상 전표를 쓰기 잠금으로 조회한다.
     *
     * <p>동일 UNDISPATCHED 전표에 대한 동시 발송 요청이 각각 검증을 통과해 SMS 를 중복 발송하지
     * 않도록, 검증부터 {@code DISPATCHED} 전이 flush 까지 같은 transaction 에서 row lock 을 유지한다.
     */
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("""
            SELECT s FROM Slip s
            WHERE s.isDeleted = false
              AND s.id IN :ids
            """)
    List<Slip> findAllByIdInAndIsDeletedFalseForExternalDispatchUpdate(
            @org.springframework.data.repository.query.Param("ids") java.util.Collection<UUID> ids);

    /**
     * 특정 배송일에 driverPhone 이 채워진 모든 슬립 — 자동 그룹화 candidate set.
     * 같은 phone 끼리 묶어 batch 1건씩 생성. 호출자에서 phone 별 group by 후 처리.
     */
    List<Slip> findAllBySlipDateAndDriverPhoneIsNotNullAndIsDeletedFalse(LocalDate slipDate);

    /** 특정 배치에 속한 슬립 목록 — 배치 상세 화면 / 공개 모바일 페이지 source. */
    List<Slip> findAllByDeliveryBatchIdAndIsDeletedFalse(UUID deliveryBatchId);

    // ---- Slice C (signature-slice-C) ----

    /**
     * signatureShareToken 단건 조회 — 인수자 view 공개 endpoint source.
     * partial UNIQUE INDEX (V5) 로 token 발급된 슬립만 유일성 보장.
     */
    Optional<Slip> findBySignatureShareTokenAndIsDeletedFalse(String signatureShareToken);

    // ---- Phase 6 M5 (slip-service-integration) — 발행 출처 + idempotency 조회 ----

    /**
     * idempotencyKey 단건 조회 — Sync REST 발행 endpoint 의 1단계 가드.
     * partial UNIQUE INDEX (V7) 로 token 발급된 슬립만 유일성 보장.
     * 같은 키 + 같은 본문 → 200 (기존 slipNo). 같은 키 + 다른 본문 → 409 Conflict.
     */
    Optional<Slip> findByIdempotencyKeyAndIsDeletedFalse(String idempotencyKey);

    /**
     * 발행 출처 기준 조회 — {@code GET /api/v1/slips/by-source} endpoint source.
     * 같은 estimateNumber/partnerOrderId 의 슬립 목록 (정상적으로는 1건, 재시도 충돌 시 0건 또는 1건).
     */
    List<Slip> findAllBySourceTypeAndSourceIdAndIsDeletedFalse(
            SlipSourceType sourceType, String sourceId);

    // ---- Phase 10 W10-4 (PR #99) — partnerId 기반 최근 활성 슬립 lookup ----

    /**
     * 특정 partnerId 의 활성 슬립 중 최근 슬립 페이지 조회 — 어플 driver-app 정차 완료 시
     * arologis-service 가 partnerCode → partnerId resolve 후 본 메서드로 slipId 매핑.
     *
     * <p>order by slipDate DESC, seqNo DESC — 같은 날짜 내 마지막 슬립 우선. status 필터 없이
     * soft-delete 만 제외 (운영 정책상 어떤 단계의 슬립이든 매핑 가능 — 실제 가드는 service 레이어
     * SIGNABLE_STATUSES 에서).
     */
    org.springframework.data.domain.Page<Slip> findAllByPartnerIdAndIsDeletedFalseOrderBySlipDateDescSeqNoDesc(
            UUID partnerId, org.springframework.data.domain.Pageable pageable);

    // ---- P1-8 (Stage 4) — accounting-service lock-by-period 의존 ----

    /**
     * 기간 + 상태 + lock_flag 조합 조회 — POST /internal/slips/lock-by-period 의 source.
     * accounting-service 가 마감 기간 CONFIRMED 슬립을 일괄 lock 처리할 때 본 메서드로 lookup.
     *
     * @param startDate 기간 시작일 (포함)
     * @param endDate 기간 종료일 (포함)
     * @param status 대상 상태 (일반적으로 CONFIRMED)
     * @return 기간 내 해당 status + lock_flag=false 슬립 (이미 lock 된 슬립은 idempotent 제외)
     */
    List<Slip> findAllBySlipDateBetweenAndStatusAndLockFlagFalseAndIsDeletedFalse(
            java.time.LocalDate startDate, java.time.LocalDate endDate,
            SlipStatus status);

    // ---- PR-E1 BE-A5/A6 — 다음날자 이미지 / 정리 리스트 ----

    /**
     * 특정 slipDate 의 활성 슬립 전체 — BE-A5 next-day-image-data 의 source.
     * partner_code / region 정렬 + 그룹핑은 service 레이어 책임.
     *
     * @param slipDate 조회 대상 날짜 (legacy GAS "내일자" = 호출자가 today+1 로 지정)
     * @return slipDate 일치 + 활성 (출고/입고 모두 포함, FE 가 slipType 분기)
     */
    List<Slip> findAllBySlipDateAndIsDeletedFalse(java.time.LocalDate slipDate);

    /**
     * 기간 + 활성 슬립 — BE-A6 cleanup 리스트의 source. status 필터는 service 레이어에서 추가.
     *
     * @param startDate 기간 시작 (포함)
     * @param endDate 기간 종료 (포함)
     * @return 기간 내 활성 슬립 전체 (정리/검증 flag 계산은 service 가 수행)
     */
    List<Slip> findAllBySlipDateBetweenAndIsDeletedFalse(
            java.time.LocalDate startDate, java.time.LocalDate endDate);

    // ---- Samhan Public 배차 메뉴 Phase A (BE Task B7) — 미배차 출고전표 페이지네이션 ----

    /**
     * 배차 메뉴 미배차 출고전표 페이지네이션 — 50/회 default.
     *
     * <p>필터:
     * <ul>
     *   <li>slipType = SHIPPING (출고 전표만)</li>
     *   <li>slipDate ∈ [from, to] (default = Asia/Seoul today ± 1일)</li>
     *   <li>dispatchStatus ∈ statuses (default = UNDISPATCHED)</li>
     *   <li>is_deleted = false</li>
     * </ul>
     *
     * <p>정렬은 호출자 {@link Pageable} 에서 지정 (slipDate desc + seqNo desc 권장).
     */
    Page<Slip> findAllBySlipTypeAndSlipDateBetweenAndDispatchStatusInAndIsDeletedFalse(
            SlipType slipType,
            java.time.LocalDate from,
            java.time.LocalDate to,
            java.util.Collection<com.samhanair.logis.slip.domain.dispatch.SlipDispatchStatus> statuses,
            Pageable pageable);

    /**
     * 배차 발송 대기 출고전표 페이지네이션 — 검수 완료 게이트 적용.
     *
     * <p>필터:
     * <ul>
     *   <li>slipType = OUTBOUND</li>
     *   <li>status = COMPLETED</li>
     *   <li>inspectorUserId / inspectorSignedAt both not null</li>
     *   <li>dispatchStatus ∈ statuses</li>
     *   <li>slipDate ∈ [from, to]</li>
     *   <li>is_deleted = false</li>
     * </ul>
     *
     * <p>정렬은 호출자 {@link Pageable} 에서 지정 (slipDate desc + seqNo desc 권장).
     */
    @org.springframework.data.jpa.repository.Query("""
            SELECT s FROM Slip s
            WHERE s.isDeleted = false
              AND s.slipType = com.samhanair.logis.slip.domain.SlipType.OUTBOUND
              AND s.status = com.samhanair.logis.slip.domain.SlipStatus.COMPLETED
              AND s.inspectorUserId IS NOT NULL
              AND s.inspectorSignedAt IS NOT NULL
              AND s.dispatchStatus IN :statuses
              AND s.slipDate BETWEEN :from AND :to
            """)
    Page<Slip> findDispatchReadyOutboundSlips(
            @org.springframework.data.repository.query.Param("from") java.time.LocalDate from,
            @org.springframework.data.repository.query.Param("to") java.time.LocalDate to,
            @org.springframework.data.repository.query.Param("statuses")
            java.util.Collection<com.samhanair.logis.slip.domain.dispatch.SlipDispatchStatus> statuses,
            Pageable pageable);

    // ---- audit Slice 2 P0 — accounting-service 세금계산서 일괄발행 내부 판매조회 ----

    /**
     * accounting-service 세금계산서 일괄발행 배치용 OUTBOUND 판매조회 (기간 + 선택적 거래처코드).
     *
     * <p>필터 조건:
     * <ul>
     *   <li>slipType = OUTBOUND</li>
     *   <li>status = CONFIRMED (확정 완료 슬립만)</li>
     *   <li>slipDate ∈ [from, to] (inclusive)</li>
     *   <li>partnerCode = :partnerCode (null 이면 전체 거래처)</li>
     *   <li>is_deleted = false</li>
     * </ul>
     *
     * <p>정렬: slipDate ASC, seqNo ASC (배치 처리 순서 보장).
     *
     * <p>accounting-service 의 {@code SlipQueryClient.fetchAllSalesRows} 가 페이지 단위로
     * 반복 호출한다. 응답 Map 키: partnerCode / partnerName / slipNo / slipDate /
     * accountingDate / supplyAmount / vatAmount / deliveryAddress / itemName.
     *
     * @param from        조회 시작일 (포함)
     * @param to          조회 종료일 (포함)
     * @param partnerCode 거래처코드 필터 (null 이면 전체)
     * @param pageable    페이지 정보 (accounting-service 기본 page_size=200)
     * @return 필터 조건 맞는 OUTBOUND CONFIRMED 슬립 페이지
     */
    @org.springframework.data.jpa.repository.Query(
            "SELECT s FROM Slip s WHERE s.isDeleted = false" +
            " AND s.slipType = com.samhanair.logis.slip.domain.SlipType.OUTBOUND" +
            " AND s.status = com.samhanair.logis.slip.domain.SlipStatus.CONFIRMED" +
            " AND s.slipDate BETWEEN :from AND :to" +
            " AND (:partnerCode IS NULL OR s.partnerCode = :partnerCode)" +
            " ORDER BY s.slipDate ASC, s.seqNo ASC")
    Page<Slip> findConfirmedSalesForPeriod(
            @org.springframework.data.repository.query.Param("from") java.time.LocalDate from,
            @org.springframework.data.repository.query.Param("to") java.time.LocalDate to,
            @org.springframework.data.repository.query.Param("partnerCode") String partnerCode,
            Pageable pageable);
}
