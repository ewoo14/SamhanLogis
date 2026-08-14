package com.samhanair.logis.slip.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.slip.domain.schedule.DeliverySchedule;
import com.samhanair.logis.slip.revision.domain.SlipSnapshot;
import com.samhanair.logis.slip.service.BundleSetInstanceKeyPolicy;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 전표 헤더 (plan §3.1) — Single Table Inheritance 로 출고/입고 1 테이블 통합 (Q1 결정).
 *
 * <p>상태 머신 (Q5: 낙관적 락 + 상태 전이 가드):
 * <pre>
 *   DRAFT → SAVED → SENT → ACCEPTED → PROCESSING → INSPECTING → COMPLETED
 *     - 출고: COMPLETED → SHIPPING → DELIVERED → CONFIRMED
 *     - 입고: COMPLETED → CONFIRMED (ship/deliver 단계 스킵)
 *   SENT/ACCEPTED/INSPECTING → REJECTED 가능 (검수자 거부)
 *   DRAFT/SAVED/SENT → CANCELED 가능
 * </pre>
 *
 * <p>Slice A (sales-polish-2) 신규 단계 INSPECTING — 검수자(창고원/INSPECTOR)가 출고 picking
 * 결과 확인 후 COMPLETED 로 전이. INSPECTING 트랜지션 시 inspectorUserId / inspectorSignedAt
 * 자동 기입 (작업지시서 결재란 검수인 셀 자동 표시).
 *
 * <p>모든 잘못된 상태 전이는 {@link BusinessException}({@link ErrorCode#CONFLICT}) 으로 통일.
 *
 * <p>낙관적 락: {@link Version} 으로 동시 mutation 충돌 감지 — 서비스 레이어에서 OptimisticLock 예외를
 * CONFLICT 로 매핑한다.
 */
@Entity
@Getter
@Table(name = "slips")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class Slip extends BaseEntity {

    private static final Set<SlipStatus> EDITABLE_STATUSES =
            EnumSet.of(SlipStatus.DRAFT, SlipStatus.SAVED);
    /** 커밋 상태 전이 및 이력 복원 시 거래처가 반드시 존재해야 하는 상태 집합. */
    private static final Set<SlipStatus> REQUIRED_PARTNER_STATUSES = EnumSet.of(
            SlipStatus.SENT,
            SlipStatus.ACCEPTED,
            SlipStatus.PROCESSING,
            SlipStatus.INSPECTING,
            SlipStatus.COMPLETED,
            SlipStatus.SHIPPING,
            SlipStatus.DELIVERED,
            SlipStatus.CONFIRMED,
            SlipStatus.REJECTED);

    /**
     * 커밋 전표 거래처 불변식의 공개 읽기 전용 상태 집합.
     *
     * <p>보정 서비스와 도메인 회귀 테스트가 동일한 집합을 사용하도록 enum 추가 시 누락을
     * 즉시 드러내는 계약이다. 호출자는 반환 집합을 수정할 수 없다.
     *
     * @return 거래처 필수 상태 9종
     */
    public static Set<SlipStatus> requiredPartnerStatuses() {
        return Set.copyOf(REQUIRED_PARTNER_STATUSES);
    }
    private static final Set<SlipStatus> CANCELABLE_STATUSES =
            EnumSet.of(SlipStatus.DRAFT, SlipStatus.SAVED, SlipStatus.SENT);

    /** Slice C — 인수자 서명을 받을 수 있는 단계 (Plan §1.3 라이프사이클 표). */
    private static final Set<SlipStatus> SIGNABLE_STATUSES =
            EnumSet.of(SlipStatus.INSPECTING, SlipStatus.COMPLETED, SlipStatus.SHIPPING);

    /** Slice C — share token base64url 48 bytes = 64자 (DeliveryBatch 와 동일 룰). */
    private static final SecureRandom SIGNATURE_RNG = new SecureRandom();
    private static final int SIGNATURE_TOKEN_BYTE_LENGTH = 48;
    /** Slice C — share token 만료: +30일 (Plan §7 Q4 결정). */
    private static final int SIGNATURE_SHARE_EXPIRY_DAYS = 30;

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(name = "slip_type", nullable = false, length = 20)
    private SlipType slipType;

    @Column(name = "slip_no", nullable = false, length = 30)
    private String slipNo;

    @Column(name = "slip_date", nullable = false)
    private LocalDate slipDate;

    @Column(name = "seq_no", nullable = false)
    private int seqNo;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private SlipStatus status;

    @Column(name = "partner_id")
    private UUID partnerId;

    @Column(name = "partner_name", length = 100)
    private String partnerName;

    /**
     * soft-delete 수행자 표시명.
     *
     * <p>{@link BaseEntity#getDeletedBy()} 는 감사용 userId 이므로 목록 UI 에 노출하지 않는다.
     * E2 목록 취소선 UX 는 본 컬럼의 이름만 표시한다.
     */
    @Column(name = "deleted_by_name", length = 100)
    private String deletedByName;

    /**
     * 거래처코드 snapshot — PR-E1 BE-1 (V15 migration) 신규.
     *
     * <p>partner_id (UUID) 와 별도 — UUID 비공개 가드 의무 (memory feedback_uuid_no_user_visibility).
     * 사용자 노출 식별자로 GAS B 이식 endpoint (BE-A0/A5/A6) 의 query filter / 이미지 그룹핑에 사용.
     *
     * <p>채움 정책: 본 슬라이스는 컬럼 + setter 만 추가. 실 채움 (partner-service 의 partnerId →
     * partnerCode resolve) 은 후속 슬라이스 (slip 생성/갱신 시점에 partner-service Feign 호출)
     * 또는 PR-D 별도 backfill 작업으로 진행. 기존 row 는 NULL 유지 (legacy 호환).
     */
    @Column(name = "partner_code", length = 50)
    private String partnerCode;

    /**
     * 가배차 지역 그룹명 snapshot — PR-E1 BE-1 (V15 migration) 신규.
     *
     * <p>arologis-service RegionClassifier 가 결정한 그룹명 ("서울특별시" / "경기남부" 등) 을
     * slip 생성/갱신 시 snapshot. 다음날자 전표 이미지 endpoint (BE-A5) 의 지역별 그룹핑에 사용.
     *
     * <p>본 슬라이스는 컬럼 + setter 만 추가. 실 채움은 후속 슬라이스에서 RegionClassifier 호출
     * 또는 arologis-service Feign lookup. 기존 row 는 NULL 유지.
     */
    @Column(name = "classified_region_group", length = 50)
    private String classifiedRegionGroup;

    @Column(name = "source_warehouse_id")
    private UUID sourceWarehouseId;

    /** 레거시 발행 원천 warehouseCode snapshot. null이면 과거 provenance 미확정(UNKNOWN). */
    @Column(name = "source_warehouse_code", length = 50)
    private String sourceWarehouseCode;

    /** 신규 전표의 창고 code 보강 대기 표시. 기존 행은 FALSE로 유지해 backfill하지 않는다. */
    @Column(name = "source_warehouse_code_pending", nullable = false)
    private boolean sourceWarehouseCodePending;

    /** 창고 code snapshot의 영속 상태 — pending boolean만으로는 claim/격리를 표현할 수 없다. */
    @Enumerated(EnumType.STRING)
    @Column(name = "source_warehouse_code_snapshot_status", nullable = false, length = 20)
    private WarehouseCodeSnapshotStatus sourceWarehouseCodeSnapshotStatus =
            WarehouseCodeSnapshotStatus.NOT_REQUESTED;

    /** inventory 호출 횟수. claim 성공 시 증가한다. */
    @Column(name = "source_warehouse_code_attempt_count", nullable = false)
    private int sourceWarehouseCodeAttemptCount;

    /** 다음 inventory 재시도 시각. PENDING 외 상태에서는 null일 수 있다. */
    @Column(name = "source_warehouse_code_next_attempt_at")
    private LocalDateTime sourceWarehouseCodeNextAttemptAt;

    /** PROCESSING claim 획득 시각. lease 회수 기준이다. */
    @Column(name = "source_warehouse_code_claimed_at")
    private LocalDateTime sourceWarehouseCodeClaimedAt;

    /** stale worker가 새 claim 결과를 덮어쓰지 못하게 하는 소유권 token. */
    @Column(name = "source_warehouse_code_claim_token")
    private UUID sourceWarehouseCodeClaimToken;

    /** 마지막 retry/격리 원인 — 운영 관측용. */
    @Column(name = "source_warehouse_code_last_error", columnDefinition = "TEXT")
    private String sourceWarehouseCodeLastError;

    /** 영구 실패 격리 시각. */
    @Column(name = "source_warehouse_code_abandoned_at")
    private LocalDateTime sourceWarehouseCodeAbandonedAt;

    @Column(name = "destination_warehouse_id")
    private UUID destinationWarehouseId;

    /**
     * 도착지 창고명 snapshot — SP-08-FU2 P2-2 (V26 migration) 신규.
     *
     * <p>inventory-service {@code GET /internal/warehouses/{warehouseId}} 조회 결과를
     * 입고전표 생성/수정 시점에 snapshot 저장. UUID 비공개 가드 의무
     * (memory feedback_uuid_no_user_visibility) — destinationWarehouseId(UUID) 대신
     * FE 가 이 컬럼을 사용자 화면에 표시한다.
     *
     * <p>채움 정책: inventory-service lookup 실패 시 null 유지 (fail-soft).
     * 기존 row 는 NULL — legacy 호환 (backfill 별도 운영).
     */
    @Column(name = "destination_warehouse_name", length = 100)
    private String destinationWarehouseName;

    @Enumerated(EnumType.STRING)
    @Column(name = "delivery_tag", length = 30)
    private DeliveryTag deliveryTag;

    @Column(name = "memo", length = 1000)
    private String memo;

    /**
     * 하차일 N — V52 신규.
     *
     * <p>상차(출고)일 M = {@link #slipDate}(잠금, 불변). 하차일은 배송일정 자동 계산
     * ({@link com.samhanair.logis.slip.domain.schedule.DeliverySchedule#computeUnloadDate})
     * 또는 사용자 override 를 {@link #applyDeliverySchedule} 로 기록.
     *
     * <p>지방(REGION) / 야적(STACK) 태그 전표만 값 보유. 그 외 태그 및 기존 전표는 null(legacy 호환).
     * 당착(지방 당일 하차) = unloadDate == slipDate.
     */
    @Column(name = "unload_date")
    private LocalDate unloadDate;

    @Column(name = "requester_id", nullable = false, length = 50)
    private String requesterId;

    @Column(name = "accepted_by", length = 50)
    private String acceptedBy;

    @Column(name = "accepted_at")
    private LocalDateTime acceptedAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @Column(name = "confirmed_at")
    private LocalDateTime confirmedAt;

    /**
     * 출고인 user-id — Slice A (sales-polish-2) ACCEPTED 트랜지션 시 자동 기입.
     * 사용자 피드백 #9: 작업지시서 결재란 출고인 셀을 acceptedBy 와 별도로 정확히 표시하기 위함.
     * 본 슬라이스 한정 도메인 명시 정책 예외 (Q4=A).
     */
    @Column(name = "dispatcher_user_id", length = 50)
    private String dispatcherUserId;

    /** 출고인 자동 서명 시각 (ACCEPTED 트랜지션 timestamp). */
    @Column(name = "dispatcher_signed_at")
    private LocalDateTime dispatcherSignedAt;

    /**
     * 검수인 user-id — Slice A (sales-polish-2) INSPECTING 트랜지션 시 자동 기입.
     * 4-eye 검증 패턴: 출고인(PROCESSING 시작자) 과 다른 검수인이 picking 결과 확인.
     */
    @Column(name = "inspector_user_id", length = 50)
    private String inspectorUserId;

    /** 검수인 자동 서명 시각 (INSPECTING 트랜지션 timestamp). */
    @Column(name = "inspector_signed_at")
    private LocalDateTime inspectorSignedAt;

    /**
     * 배송 기사명 — Slice B (notification-slice-B) 신규.
     * DRAFT/SAVED 단계에서 입력. {@link #editHeader} 로 갱신.
     * 같은 driverPhone + slipDate 슬립이 자동으로 단일 DeliveryBatch 로 그룹된다.
     */
    @Column(name = "driver_name", length = 50)
    private String driverName;

    /**
     * 배송 기사 연락처 — Slice B (notification-slice-B) 신규.
     * 한국 휴대폰 패턴 ({@code 010-XXXX-XXXX}) 권장 (FE PhoneInput 검증).
     * DeliveryBatch 자동 그룹의 그룹 키.
     */
    @Column(name = "driver_phone", length = 20)
    private String driverPhone;

    /**
     * 배송 배치 FK — Slice B (notification-slice-B) 신규. nullable.
     * DeliveryBatch.addSlip / removeSlip 도메인 메서드를 통해서만 변경되어야 한다 (양방향 일관성).
     * 본 슬립이 어떤 배송 배치(=기사 SMS 단위) 에 속하는지 식별.
     */
    @Column(name = "delivery_batch_id")
    private UUID deliveryBatchId;

    // ---------- Samhan Public 배차 메뉴 Phase A (D-DB-04) — slip 배차 상태 ----------

    /**
     * 배차 상태 — Samhan Public 배차 메뉴 Phase A (V22 migration).
     *
     * <ul>
     *   <li>{@link com.samhanair.logis.slip.domain.dispatch.SlipDispatchStatus#UNDISPATCHED}
     *       (default) — 배차 메뉴 "미배차" 목록 source</li>
     *   <li>{@link com.samhanair.logis.slip.domain.dispatch.SlipDispatchStatus#DISPATCHING}
     *       — 배차 완료 trigger → arologis 발송 후 매칭 대기</li>
     *   <li>{@link com.samhanair.logis.slip.domain.dispatch.SlipDispatchStatus#DISPATCHED}
     *       — arologis confirm 회신 완료 (매칭된 기사 정보 dispatch_matched_driver 테이블 참조)</li>
     * </ul>
     *
     * <p>전이 메서드: {@link #markDispatchPending}, {@link #markDispatchConfirmed},
     * {@link #markDispatchReleased}. Phase A 한정 — Phase C 부터 수정/취소 흐름 추가.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "dispatch_status", nullable = false, length = 32)
    private com.samhanair.logis.slip.domain.dispatch.SlipDispatchStatus dispatchStatus =
            com.samhanair.logis.slip.domain.dispatch.SlipDispatchStatus.UNDISPATCHED;

    // ---------- Slice C (signature-slice-C Plan §1.1) — 인수자 전자서명 7 필드 ----------

    /**
     * 인수자 서명 시각 — Slice C. {@link #recordSignature} 호출 시 서버 timestamp 로 기록.
     * null 이면 서명 미완료 상태.
     */
    @Column(name = "signed_at")
    private LocalDateTime signedAt;

    /** 인수자명 — Slice C. 자유 입력 (1~50자). */
    @Column(name = "signer_name", length = 50)
    private String signerName;

    /**
     * 서명 PNG 바이너리 — Slice C. ≤50KB (서비스 레이어 가드).
     * Q2 결정: DB bytea (월 1만건 미만 단계) — Phase 6+ MinIO 마이그.
     *
     * NOTE: {@code @Lob} 미사용 — Hibernate 6 PostgreSQL 에서 {@code @Lob byte[]} 는
     * {@code oid} (large object) 로 매핑되어 V5 의 {@code BYTEA} 컬럼과 mismatch
     * → SchemaManagementException. byte[] + 명시 nothing 으로 BYTEA 매핑 위임.
     */
    @Column(name = "signature_png")
    private byte[] signaturePng;

    /**
     * SHA-256 hex 64자 — Slice C. 서버에서 PNG bytes 로 재계산하여 client hash 와 비교 검증.
     * mismatch 면 INVALID_INPUT (400). 무결성 1차 수단.
     */
    @Column(name = "signature_hash", length = 64)
    private String signatureHash;

    /** 서명 채널 — Slice C. {@link SignatureChannel#MOBILE_CANVAS} / PAPER_SCAN. */
    @Enumerated(EnumType.STRING)
    @Column(name = "signature_channel", length = 20)
    private SignatureChannel signatureChannel;

    /**
     * 서명 발급 source — Phase 10 W10-4 (PR #99) 신규.
     *
     * <p>{@link SignatureSource#LINK} = 기존 SMS/Aligo 공개 모바일 endpoint 발급 (V5 이전 데이터 기본값).
     * {@link SignatureSource#APP} = arologis 모바일 어플 직접 캡처 (W10-4 신규 endpoint).
     *
     * <p>V10 migration: NOT NULL DEFAULT 'LINK' — 기존 데이터 backfill + 신규 데이터는 service 가 명시.
     * 본 entity field 는 매핑 시 null 이 들어오면 LINK 로 보강 ({@link #recordSignature} 가드).
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "signature_source", nullable = false, length = 20)
    private SignatureSource signatureSource = SignatureSource.LINK;

    /**
     * 인수자 share 토큰 — Slice C. base64url 64자, partial UNIQUE (NULL 허용).
     * 인수자 view 공개 endpoint {@code GET /public/signatures/{shareToken}} 진입 키.
     */
    /**
     * NOTE: {@code unique=true} 미사용 — V5 SQL 은 partial UNIQUE INDEX
     * ({@code WHERE signature_share_token IS NOT NULL}) 로 NULL 허용 + 발급 시
     * 유일성 강제. JPA inline unique 는 full UNIQUE constraint 를 생성하라는
     * 의미라 Hibernate {@code validate} 가 partial index 와 mismatch 로 거부.
     */
    @Column(name = "signature_share_token", length = 64)
    private String signatureShareToken;

    /**
     * Share 토큰 만료 시각 — Slice C. {@code signedAt + 30일} (Q4 결정).
     * 만료 후 인수자 view 410 GONE.
     */
    @Column(name = "signature_share_expires_at")
    private LocalDateTime signatureShareExpiresAt;

    // ---------- Slice C2 (PR #23 follow-up) — 배송기사 서명 4 필드 ----------
    // 인수자 서명과 패턴 동일 (PNG bytea + SHA-256 + channel + signed timestamp).
    // share token 은 인수자 share 토큰을 그대로 재사용 (1 개 share view 에 둘 다 표시).

    /** 배송기사 서명 시각 — Slice C2. null 이면 기사 서명 미완료. */
    @Column(name = "driver_signed_at")
    private LocalDateTime driverSignedAt;

    /** 배송기사 서명 PNG ≤50KB. NOTE: signaturePng 와 동일 — @Lob 미사용 (BYTEA 매핑). */
    @Column(name = "driver_signature_png")
    private byte[] driverSignaturePng;

    /** SHA-256 hex 64자 — 무결성 검증용. */
    @Column(name = "driver_signature_hash", length = 64)
    private String driverSignatureHash;

    /** 서명 채널. */
    @Enumerated(EnumType.STRING)
    @Column(name = "driver_signature_channel", length = 20)
    private SignatureChannel driverSignatureChannel;

    /**
     * 기사 서명 발급 source — Phase 10 W10-4 (PR #99) 신규.
     *
     * <p>인수자 {@link #signatureSource} 와 별도 — 한 슬립에서 인수자=LINK / 기사=APP 같은 혼합 가능.
     * V10 migration: NOT NULL DEFAULT 'LINK'.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "driver_signature_source", nullable = false, length = 20)
    private SignatureSource driverSignatureSource = SignatureSource.LINK;

    /**
     * 회계 마감 lock — V14 migration 신규.
     *
     * <p>accounting-service 가 {@code POST /internal/slips/lock-by-period} 호출 시 해당 기간
     * CONFIRMED 슬립을 일괄 lock_flag=true 로 update. lock 된 슬립은 reject/cancel 도메인 메서드가
     * CONFLICT 던짐 (마감 후 매출 정정 차단).
     *
     * <p>정책:
     * <ul>
     *   <li>lock_flag = true → 도메인 mutation (reject / cancel) 차단</li>
     *   <li>lock_flag = false (DEFAULT) → 정상 도메인 라이프사이클</li>
     *   <li>lock 해제는 별도 admin endpoint 필요 (현 슬라이스 미구현 — 정식 cutover 시점 결정)</li>
     * </ul>
     */
    @Column(name = "lock_flag", nullable = false)
    private Boolean lockFlag = Boolean.FALSE;

    // ---------- PR-G1 BE (V16 migration) — e-Count schema 보강 12 컬럼 ----------
    // legacy GAS 가 e-Count API 로 출고전표 발행 시 사용한 14 BulkDatas 필드 중
    // 누락된 12 필드를 본 entity 에 직접 매핑. memo 1000자 prepend 정책 폐기 →
    // 각 의미 단위를 별도 컬럼으로 명시적 저장. e-Count API 호출은 완전 제거 (사용자 결정).

    /**
     * 입출고 구분 — V16 (PR-G1) 신규. {@code "10"}=출고, {@code "11"}=입고.
     *
     * <p>legacy e-Count BulkDatas {@code IO_TYPE}. 현 publish endpoint 는 OUTBOUND 한정이므로
     * 신규 row 는 DEFAULT '10'. {@link SlipType} 과 중복 정보지만 e-Count payload 호환 보존용.
     */
    @Column(name = "io_type", length = 2)
    private String ioType;

    /**
     * 발행 시각 HHmmss — V16 (PR-G1) 신규.
     *
     * <p>legacy e-Count BulkDatas {@code TIME_DATE}. {@link #createdAt} 와 별도 — legacy
     * payload 의 정확한 시각 보존 (e-Count cutover 후 backfill 용도).
     */
    @Column(name = "time_date", length = 8)
    private String timeDate;

    /**
     * 거래처 연락처 snapshot — V16 (PR-G1) 신규. legacy {@code U_MEMO1} (e-Count 의 memo 1번 슬롯).
     *
     * <p>partner-service partners.tel 과 별도 — 발행 시점의 snapshot. partner master 변경 후에도
     * 발행된 슬립의 인쇄 양식에 정확한 당시 연락처 표시.
     */
    @Column(name = "customer_tel", length = 50)
    private String customerTel;

    /**
     * 거래처 사업장 주소 snapshot — V16 (PR-G1) 신규. legacy {@code U_MEMO2}.
     */
    @Column(name = "customer_address", length = 500)
    private String customerAddress;

    /**
     * 거래처 대표자명 snapshot — V16 (PR-G1) 신규. legacy {@code U_MEMO3}.
     */
    @Column(name = "customer_representative", length = 100)
    private String customerRepresentative;

    /**
     * 배송지 주소 — V16 (PR-G1) 신규. legacy {@code U_TXT1}.
     *
     * <p>**리팩토링 핵심**: 기존 {@link SlipPublishService#composeMemo} 가 memo 컬럼에
     * "배송지: ..." 형식으로 prepend 하던 정책 폐기. 본 컬럼에 직접 저장. 인쇄 양식 / 주소 매칭 시
     * memo 파싱 불필요.
     */
    @Column(name = "shipping_address", length = 500)
    private String shippingAddress;

    /**
     * 검수지 주소 — V16 (PR-G1) 신규. legacy {@code ADD_TXT_01_T}.
     *
     * <p>{@link #shippingAddress} 와 별개 — 배송 도착지와 검수자 사무실이 다른 경우.
     */
    @Column(name = "inspection_address", length = 500)
    private String inspectionAddress;

    /**
     * 수령자 연락처 — V16 (PR-G1) 신규. legacy {@code ADD_TXT_03_T}.
     *
     * <p>{@link #customerTel} 과 별개 — 거래처 대표 번호 vs 현장 수령자 직접 연락처.
     */
    @Column(name = "receiver_phone", length = 50)
    private String receiverPhone;

    /**
     * 결제 만기 라벨 MM-DD — V16 (PR-G1) 신규. legacy {@code ADD_TXT_05_T}.
     *
     * <p>"05-31" / "익월말" 등 자유 형식 (legacy 데이터 호환). 회계 마감 자동 매칭에 사용 X
     * (단순 표시 + 인쇄 양식 textbox).
     */
    @Column(name = "payment_due_label", length = 20)
    private String paymentDueLabel;

    /**
     * 할인 정보 자유 텍스트 — V16 (PR-G1) 신규. legacy {@code ADD_TXT_06_T}.
     *
     * <p>"5% 할인" / "VIP 단가" 등. SlipLine 의 unitPrice 가 이미 할인 적용가이므로 본 컬럼은
     * 인쇄 양식 / 감사 reference 용도.
     */
    @Column(name = "discount_info", length = 200)
    private String discountInfo;

    /**
     * 대금 회수 조건 — V16 (PR-G1) 신규. legacy {@code COLL_TERM}.
     *
     * <p>"월말" / "익월말" / "현금" 등. partner-service partners.collectTerm 과 별도 snapshot.
     */
    @Column(name = "collect_term", length = 50)
    private String collectTerm;

    /**
     * 거래 약정 조건 — V16 (PR-G1) 신규. legacy {@code AGREE_TERM}.
     *
     * <p>특수 약정 (계약 단가 / 운송비 별도 등) 의 요약 라벨.
     */
    @Column(name = "agree_term", length = 50)
    private String agreeTerm;

    // ---------- V20 (feature/sales-purchase-query-redesign) — 판매/구매조회 컬럼 확장 ----------

    /**
     * 거래처 사업자등록번호 snapshot — V20 신규.
     *
     * <p>partner-service 의 사업자등록번호를 전표 생성/수정 시점에 snapshot. UUID 비공개 가드 의무 —
     * partnerId(UUID) 대신 사용자 화면에 표시되는 사업자등록번호. 판매/구매조회 화면 "사업자등록번호" 컬럼.
     *
     * <p>채움 정책: 본 슬라이스는 컬럼 + 도메인 메서드만. 실 채움은 후속 슬라이스에서 partner-service
     * Feign 조회 또는 backfill 작업. 기존 row 는 NULL 유지 (legacy 호환).
     */
    @Column(name = "business_number", length = 20)
    private String businessNumber;

    /**
     * 배송주소 (실제 인수 현장) — V20 신규.
     *
     * <p>shippingAddress(거래처 사업장 주소, V16) 와 별도 — 거래처 본사와 납품 현장이 다른 경우.
     * 판매/구매조회 화면의 배송지 컬럼에 사용.
     */
    @Column(name = "delivery_address", length = 500)
    private String deliveryAddress;

    /**
     * 감리주소 (실제 설치/감리 현장) — V20 신규.
     *
     * <p>inspectionAddress(검수지, V16) 와 의미 구분 — inspectionAddress 는 검수자 사무소,
     * supervisionAddress 는 실제 설치 및 감리가 이루어지는 현장 주소.
     * 판매/구매조회 화면 "감리주소" 컬럼.
     */
    @Column(name = "supervision_address", length = 500)
    private String supervisionAddress;

    /**
     * 프로젝트명 — V20 신규.
     *
     * <p>복수의 전표가 동일 프로젝트에 묶이는 경우 조회 · 집계 기준이 된다.
     * 판매/구매조회 화면 "프로젝트명" 컬럼 + 검색 필터.
     */
    @Column(name = "project_name", length = 200)
    private String projectName;

    /**
     * 인수자 번호 — V20 신규.
     *
     * <p>signerName(인수자명, V5) 과 별도 — 서명인 성명이 아닌 현장 담당자의 직접 연락처.
     * 판매/구매조회 화면 "인수자번호" 컬럼.
     */
    @Column(name = "recipient_phone", length = 20)
    private String recipientPhone;

    /**
     * 입금예정일 — V20 신규.
     *
     * <p>paymentDueLabel(자유 텍스트, V16) 과 별도의 정형 DATE 컬럼. 회계 기간 매칭 / 미수금 관리에 활용.
     * 판매/구매조회 화면 "입금예정일" 컬럼.
     */
    @Column(name = "payment_due_date")
    private LocalDate paymentDueDate;

    /**
     * 인쇄 시각 — V20 신규.
     *
     * <p>null = 미인쇄. {@link #recordPrint()} 도메인 메서드 호출 시 서버 timestamp 기록.
     * 판매/구매조회 화면 "인쇄여부" 컬럼 ({@code printedAt != null → 인쇄됨}).
     */
    @Column(name = "printed_at")
    private LocalDateTime printedAt;

    /**
     * 누적 수정 횟수 — PR-H2 V18 신규.
     *
     * <p>{@code slip_audit_logs.revision_no} 채번 보조 + FE timeline UI 표시. mutation 마다 +1
     * 증가 ({@link #incrementRevision} 호출). 같은 트랜잭션의 다중 필드 변경은 1회만 증가
     * (audit log 의 revision_no 는 그 값을 모든 row 에 공유).
     *
     * <p>기존 row 는 V18 migration 의 DEFAULT 0 으로 backfill — 첫 수정 시 1 부터 시작.
     */
    @Column(name = "revision_count", nullable = false)
    private Integer revisionCount = 0;

    /**
     * S2c 상태의존 수정카운트 기준선.
     *
     * <p>OUTBOUND 는 검수 완료(COMPLETED), 비-OUTBOUND 는 다음 결재선 전송(SENT) 시점의
     * {@link #revisionCount} 를 1회 기록한다. null 은 아직 임계 전이를 통과하지 않은 드래프트 단계다.
     */
    @Column(name = "revision_count_baseline")
    private Integer revisionCountBaseline;

    /**
     * S2d-1 셀 인라인 레드라인 기준 revision.
     *
     * <p>OUTBOUND 는 검수 완료(COMPLETED), 비-OUTBOUND 는 다음 결재선 전송(SENT) 시점의
     * {@code max(slip_revisions.revision_no)} 를 1회 기록한다. null 은 아직 임계 전이를
     * 통과하지 않은 드래프트 단계다.
     */
    @Column(name = "redline_anchor_revision_no")
    private Integer redlineAnchorRevisionNo;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    @OneToMany(mappedBy = "slip", cascade = CascadeType.ALL, orphanRemoval = false,
            fetch = FetchType.LAZY)
    private List<SlipLine> lines = new ArrayList<>();

    private Slip(SlipType slipType, String slipNo, LocalDate slipDate, int seqNo,
                 UUID sourceWarehouseId, UUID destinationWarehouseId,
                 UUID partnerId, String partnerName,
                 DeliveryTag deliveryTag, String memo, String requesterId) {
        this.slipType = slipType;
        this.slipNo = slipNo;
        this.slipDate = slipDate;
        this.seqNo = seqNo;
        this.sourceWarehouseId = sourceWarehouseId;
        this.destinationWarehouseId = destinationWarehouseId;
        this.partnerId = partnerId;
        this.partnerName = partnerName;
        this.deliveryTag = deliveryTag;
        this.memo = memo;
        this.requesterId = requesterId;
        this.status = SlipStatus.DRAFT;
        this.version = 0L;
        // BE-3 채택 fix — signatureSource init 명시 (NULL INSERT 회귀 가드, V10 NOT NULL 가드와 일관)
        this.signatureSource = SignatureSource.LINK;
        this.driverSignatureSource = SignatureSource.LINK;
    }

    /**
     * 출고전표 생성 — sourceWarehouseId 필수, destinationWarehouseId 는 거래처 직배 등 시 null 가능.
     *
     * @param slipNo 채번된 전표번호 ({@code yyyy/MM/dd-N})
     * @param slipDate 전표 날짜
     * @param seqNo 같은 날짜 내 순번 (1 이상)
     * @param sourceWarehouseId 출고지 창고 UUID (필수)
     * @param destinationWarehouseId 도착지 창고 UUID (선택)
     * @param partnerId 거래처 UUID (선택, 첫 슬라이스에서 검증 안 함)
     * @param partnerName 거래처명 snapshot (선택)
     * @param deliveryTag 배송 태그 (선택, OUTBOUND 호환만 허용)
     * @param memo 메모 (선택)
     * @param requesterId 요청자 user-id (필수)
     * @return DRAFT 상태의 신규 출고전표
     * @throws BusinessException (INVALID_INPUT) sourceWarehouseId 가 null 일 때
     * @throws com.samhanair.logis.common.exception.BusinessException (INVALID_INPUT) deliveryTag 의 direction 이 INBOUND 일 때
     */
    public static Slip createOutbound(String slipNo, LocalDate slipDate, int seqNo,
                                      UUID sourceWarehouseId, UUID destinationWarehouseId,
                                      UUID partnerId, String partnerName,
                                      DeliveryTag deliveryTag, String memo, String requesterId) {
        if (sourceWarehouseId == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "출고전표는 출고 창고가 필수입니다");
        }
        validateTagDirection(deliveryTag, SlipType.OUTBOUND);
        return new Slip(SlipType.OUTBOUND, slipNo, slipDate, seqNo,
                sourceWarehouseId, destinationWarehouseId,
                partnerId, partnerName, deliveryTag, memo, requesterId);
    }

    /**
     * 입고전표 생성 — destinationWarehouseId 필수 (도착지). sourceWarehouseId 는 항상 null.
     *
     * @param slipNo 채번된 전표번호 ({@code yyyy/MM/dd-N})
     * @param slipDate 전표 날짜
     * @param seqNo 같은 날짜 내 순번
     * @param destinationWarehouseId 입고 창고 UUID (필수)
     * @param partnerId 거래처 UUID (선택)
     * @param partnerName 거래처명 snapshot (선택)
     * @param deliveryTag 배송 태그 (선택, INBOUND 호환만 허용)
     * @param memo 메모 (선택)
     * @param requesterId 요청자 user-id (필수)
     * @return DRAFT 상태의 신규 입고전표
     * @throws BusinessException (INVALID_INPUT) destinationWarehouseId 가 null 일 때
     * @throws com.samhanair.logis.common.exception.BusinessException (INVALID_INPUT) deliveryTag 의 direction 이 OUTBOUND 일 때
     */
    public static Slip createInbound(String slipNo, LocalDate slipDate, int seqNo,
                                     UUID destinationWarehouseId,
                                     UUID partnerId, String partnerName,
                                     DeliveryTag deliveryTag, String memo, String requesterId) {
        if (destinationWarehouseId == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "입고전표는 입고 창고가 필수입니다");
        }
        validateTagDirection(deliveryTag, SlipType.INBOUND);
        return new Slip(SlipType.INBOUND, slipNo, slipDate, seqNo,
                null, destinationWarehouseId,
                partnerId, partnerName, deliveryTag == null ? DeliveryTag.PURCHASE : deliveryTag,
                memo, requesterId);
    }

    private static void validateTagDirection(DeliveryTag tag, SlipType slipType) {
        if (tag != null && tag.getDirection() != slipType) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "'" + tag.getKoreanLabel() + "' 배송 태그는 "
                            + slipType.getDisplayName() + "에 사용할 수 없습니다");
        }
    }

    /**
     * 라인 1건 추가 — 양방향 연관관계 유지. 서비스 레이어에서 DRAFT/SAVED 단계 가드 후 호출해야 한다.
     *
     * @param line {@link SlipLine#create} 로 생성된 라인 (slip 참조 이미 설정)
     */
    public void addLine(SlipLine line) {
        this.lines.add(line);
    }

    /**
     * 라인 1건 제거 (orphan removal). DRAFT/SAVED 단계에서만 호출되어야 함 (서비스 레이어 가드).
     *
     * @param line 제거할 라인 인스턴스
     * @return 제거 성공 여부
     */
    public boolean removeLine(SlipLine line) {
        if (line == null) {
            return false;
        }
        line.markDeleted("system");
        return this.lines.remove(line);
    }

    /**
     * 매입 direct PUT 전용 헤더 수정.
     *
     * <p>기존 승인 요청 흐름과 별개로 INBOUND 전표의 구매관리 필드를 즉시 갱신한다. null 값은
     * 기존 값을 보존한다.
     *
     * @param partnerId 거래처 UUID (null 이면 보존) — D-R8-7 신규. 종전에는 {@code partnerName} 만
     *        갱신돼 거래처를 바꿔 저장해도 {@code partner_id} 가 불변이었고, (거래처+품목) 가격기억이
     *        <b>원 거래처</b>에 각인됐다 (R8-BE-3 라이브 실증)
     */
    public void updateHeader(UUID partnerId, String partnerName, String partnerCode, String memo,
                             String businessNumber, String deliveryAddress,
                             String supervisionAddress, String projectName,
                             String recipientPhone, LocalDate paymentDueDate) {
        if (this.slipType != SlipType.INBOUND) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "매입 전표만 직접 수정할 수 있습니다.");
        }
        requireEditable();
        if (partnerId != null) {
            this.partnerId = partnerId;
        }
        if (partnerName != null) {
            this.partnerName = partnerName;
        }
        if (partnerCode != null) {
            this.partnerCode = partnerCode;
        }
        if (memo != null) {
            this.memo = memo;
        }
        if (businessNumber != null) {
            this.businessNumber = businessNumber;
        }
        withProjectInfo(null, deliveryAddress, supervisionAddress, projectName,
                recipientPhone, paymentDueDate);
    }

    /**
     * 매입 direct PUT 라인 전체 교체.
     *
     * <p>{@code orphanRemoval=false} 정책을 지키기 위해 기존 라인은 hard delete 하지 않고
     * {@link BaseEntity#markDeleted(String)} 로 비활성화한 뒤 컬렉션에서만 제거한다.
     */
    public void replaceLines(List<SlipLine> newLines, String actorId) {
        if (this.slipType != SlipType.INBOUND) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "매입 전표만 직접 수정할 수 있습니다.");
        }
        requireEditable();
        String deleter = actorId == null || actorId.isBlank() ? "system" : actorId;
        for (SlipLine line : new ArrayList<>(this.lines)) {
            line.markDeleted(deleter);
        }
        this.lines.clear();
        if (newLines != null) {
            this.lines.addAll(newLines);
        }
    }

    /**
     * 매출 direct PUT 전용 헤더 수정 (SP-08-6-2).
     *
     * <p>기존 승인 요청 흐름과 별개로 OUTBOUND 전표의 판매관리 필드를 즉시 갱신한다.
     * null 값은 기존 값을 보존한다. DRAFT/SAVED 단계에서만 허용.
     *
     * @param partnerId 거래처 UUID (null 이면 보존) — D-R8-7 신규. {@link #updateHeader} 미러
     * @param partnerName 거래처명 (null 이면 보존)
     * @param partnerCode 거래처코드 (null 이면 보존)
     * @param memo 메모 (null 이면 보존)
     * @param businessNumber 사업자등록번호 (null 이면 보존)
     * @param deliveryAddress 납품지 주소 (null 이면 보존)
     * @param supervisionAddress 감리지 주소 (null 이면 보존)
     * @param projectName 프로젝트명 (null 이면 보존)
     * @param recipientPhone 인수자 번호 (null 이면 보존)
     * @param paymentDueDate 입금예정일 (null 이면 보존)
     * @throws BusinessException(SLIP_UPDATE_NON_SALES) slipType 이 OUTBOUND 가 아닐 때
     * @throws BusinessException(CONFLICT) DRAFT/SAVED 가 아닌 단계일 때
     */
    public void updateSalesHeader(UUID partnerId, String partnerName, String partnerCode, String memo,
                                  String businessNumber, String deliveryAddress,
                                  String supervisionAddress, String projectName,
                                  String recipientPhone, LocalDate paymentDueDate) {
        if (this.slipType != SlipType.OUTBOUND) {
            throw new BusinessException(ErrorCode.SLIP_UPDATE_NON_SALES,
                    ErrorCode.SLIP_UPDATE_NON_SALES.getDefaultMessage());
        }
        requireEditable();
        if (partnerId != null) {
            this.partnerId = partnerId;
        }
        if (partnerName != null) {
            this.partnerName = partnerName;
        }
        if (partnerCode != null) {
            this.partnerCode = partnerCode;
        }
        if (memo != null) {
            this.memo = memo;
        }
        if (businessNumber != null) {
            this.businessNumber = businessNumber;
        }
        withProjectInfo(null, deliveryAddress, supervisionAddress, projectName,
                recipientPhone, paymentDueDate);
    }

    /**
     * 매출 direct PUT 라인 전체 교체 (SP-08-6-2).
     *
     * <p>{@code orphanRemoval=false} 정책을 지키기 위해 기존 라인은 hard delete 하지 않고
     * {@link com.samhanair.logis.common.entity.BaseEntity#markDeleted(String)} 로 비활성화한 뒤
     * 컬렉션에서만 제거한다.
     *
     * @param newLines 교체할 신규 라인 목록 (null 또는 empty 는 서비스 레이어에서 사전 차단)
     * @param actorId 수정자 ID (audit 기록용, null 허용 → "system" 폴백)
     * @throws BusinessException(SLIP_UPDATE_NON_SALES) slipType 이 OUTBOUND 가 아닐 때
     * @throws BusinessException(CONFLICT) DRAFT/SAVED 가 아닌 단계일 때
     */
    public void replaceSalesLines(List<SlipLine> newLines, String actorId) {
        if (this.slipType != SlipType.OUTBOUND) {
            throw new BusinessException(ErrorCode.SLIP_UPDATE_NON_SALES,
                    ErrorCode.SLIP_UPDATE_NON_SALES.getDefaultMessage());
        }
        requireEditable();
        String deleter = actorId == null || actorId.isBlank() ? "system" : actorId;
        for (SlipLine line : new ArrayList<>(this.lines)) {
            line.markDeleted(deleter);
        }
        this.lines.clear();
        if (newLines != null) {
            this.lines.addAll(newLines);
        }
    }

    /**
     * 헤더 부분 수정 — DRAFT 또는 SAVED 단계에서만 허용. null 이 아닌 인자만 적용.
     *
     * <p>Slice B (notification-slice-B): {@code driverName}, {@code driverPhone} 2 인자 신규
     * 추가 — 출고 슬립의 배송 기사 정보 입력. 같은 driverPhone + slipDate 슬립이 자동으로
     * 단일 DeliveryBatch 로 그룹된다 (관리자 화면 "링크발송" 메뉴).
     *
     * @param partnerId 거래처 UUID (null 이면 보존)
     * @param partnerName 거래처명 (null 이면 보존)
     * @param deliveryTag 배송 태그 (null 이면 보존). slipType 호환 검증.
     * @param memo 메모 (null 이면 보존)
     * @param driverName 배송 기사명 (null 이면 보존, 빈 문자열은 그대로 저장)
     * @param driverPhone 배송 기사 연락처 (null 이면 보존)
     * @throws BusinessException(CONFLICT) 현재 상태가 DRAFT/SAVED 가 아닐 때
     * @throws com.samhanair.logis.common.exception.BusinessException (CONFLICT 수정불가 상태 / INVALID_INPUT deliveryTag 의 direction 이 slipType 과 불일치)
     */
    public void editHeader(UUID partnerId, String partnerName, DeliveryTag deliveryTag, String memo,
                           String driverName, String driverPhone) {
        if (!EDITABLE_STATUSES.contains(this.status)) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "수정 가능한 상태가 아닙니다: " + this.status.getDisplayName());
        }
        if (deliveryTag != null) {
            validateTagDirection(deliveryTag, this.slipType);
            this.deliveryTag = deliveryTag;
        }
        if (partnerId != null) {
            this.partnerId = partnerId;
        }
        if (partnerName != null) {
            this.partnerName = partnerName;
        }
        if (memo != null) {
            this.memo = memo;
        }
        if (driverName != null) {
            this.driverName = driverName;
        }
        if (driverPhone != null) {
            this.driverPhone = driverPhone;
        }
    }

    /**
     * 슬립 생성 시 driver 정보 직접 설정 — 서비스 레이어에서 createOutbound/Inbound 직후 호출.
     * 별도 mutation API 가 아닌 생성 시점 보조 setter (CreateSlipRequest 의 driverName/Phone 적용용).
     * Slice B (notification-slice-B) 신규.
     *
     * @param driverName 배송 기사명
     * @param driverPhone 배송 기사 연락처
     */
    public void setDriverContact(String driverName, String driverPhone) {
        this.driverName = driverName;
        this.driverPhone = driverPhone;
    }

    /**
     * DeliveryBatch 연결 — DeliveryBatch.addSlip 내부에서만 호출 (package-private 의도).
     * Slice B (notification-slice-B) 신규.
     *
     * @param batchId 배치 UUID
     */
    public void assignToBatch(UUID batchId) {
        this.deliveryBatchId = batchId;
    }

    /**
     * partner_code snapshot 갱신 — PR-E1 BE-1 (V15) 신규. partner-service Feign lookup 결과
     * 또는 admin 화면 직접 입력 경로에서 호출.
     *
     * <p>본 메서드는 라이프사이클 단계 가드 없음 (어떤 단계에서도 snapshot 갱신 가능 — 사용자 명시
     * "추후 partner_code 매핑" backfill 정책). Slice B 의 setDriverContact 패턴과 동일 — 도메인
     * 단순 setter.
     *
     * @param partnerCode partner-service partners.partner_code (예: "P-2026-0001")
     */
    public void setPartnerCode(String partnerCode) {
        this.partnerCode = partnerCode;
    }

    /** partnerId로 확인한 거래처 코드 snapshot을 보정한다. 값은 외부 원본에서 확인된 경우에만 호출한다. */
    public void backfillPartnerCode(String partnerCode) {
        if (partnerCode == null || partnerCode.isBlank()) {
            throw new IllegalArgumentException("partnerCode는 비어 있을 수 없습니다");
        }
        this.partnerCode = partnerCode.trim();
    }

    /** 거래처 원본이 없어 복원 근거를 남긴 전표를 목록·집계에서 soft-delete 격리한다. */
    public void quarantineMissingPartnerSource(String actor) {
        this.markDeleted(actor);
    }

    /** 거래처 원본 복구와 코드 snapshot 보완이 끝난 격리 전표를 다시 활성화한다. */
    public void restoreFromPartnerQuarantine(String partnerCode) {
        backfillPartnerCode(partnerCode);
        markRestoredWithNameCleared();
    }

    /**
     * cutover 보정 전용 거래처 UUID 주입.
     *
     * <p>일반 편집 API가 committed 전표의 거래처를 임의 변경하지 않도록 public 범용 setter 대신
     * 의미가 드러나는 보정 메서드로 한정한다. 실제 {@code modified_by}는 JPA auditing이 기록한다.
     *
     * @param partnerId partner-service가 해소한 거래처 UUID (null 불가)
     */
    public void backfillPartnerId(UUID partnerId) {
        if (partnerId == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "보정 거래처 UUID는 필수입니다");
        }
        this.partnerId = partnerId;
    }

    /**
     * 가배차 지역 그룹 snapshot 갱신 — PR-E1 BE-1 (V15) 신규. arologis RegionClassifier 결과
     * 또는 admin 직접 분류 경로에서 호출. partner_code 와 동일하게 단순 setter.
     *
     * @param classifiedRegionGroup arologis vehicle_stops.classified_region_group 동일 그룹명
     */
    public void setClassifiedRegionGroup(String classifiedRegionGroup) {
        this.classifiedRegionGroup = classifiedRegionGroup;
    }

    /** 출고 업무 구분의 원천 code를 저장한다. 표시명·UUID로 대체하지 않는다. */
    public void setSourceWarehouseCode(String sourceWarehouseCode) {
        this.sourceWarehouseCode = sourceWarehouseCode == null || sourceWarehouseCode.isBlank()
                ? null : sourceWarehouseCode.trim();
        if (this.sourceWarehouseCode != null) {
            this.sourceWarehouseCodePending = false;
            this.sourceWarehouseCodeSnapshotStatus = WarehouseCodeSnapshotStatus.COMPLETED;
            clearSourceWarehouseCodeClaim();
        }
    }

    /** 신규 출고전표를 inventory code 보강 재시도 대상으로 표시한다. */
    public void markSourceWarehouseCodePending() {
        this.sourceWarehouseCodePending = true;
        this.sourceWarehouseCodeSnapshotStatus = WarehouseCodeSnapshotStatus.PENDING;
        this.sourceWarehouseCodeAttemptCount = 0;
        this.sourceWarehouseCodeNextAttemptAt = LocalDateTime.now();
        this.sourceWarehouseCodeLastError = null;
        this.sourceWarehouseCodeAbandonedAt = null;
        clearSourceWarehouseCodeClaim();
    }

    /** 현재 worker token이 이 전표의 snapshot claim을 소유하는지 확인한다. */
    public boolean ownsSourceWarehouseCodeClaim(UUID claimToken) {
        return sourceWarehouseCodeSnapshotStatus == WarehouseCodeSnapshotStatus.PROCESSING
                && claimToken != null
                && claimToken.equals(sourceWarehouseCodeClaimToken);
    }

    /** 일시 장애는 PENDING으로 되돌리고 다음 시각에 재시도한다. */
    public void retrySourceWarehouseCodeSnapshot(
            UUID claimToken, LocalDateTime nextAttemptAt, String error) {
        if (!ownsSourceWarehouseCodeClaim(claimToken)) return;
        this.sourceWarehouseCodeSnapshotStatus = WarehouseCodeSnapshotStatus.PENDING;
        this.sourceWarehouseCodePending = true;
        this.sourceWarehouseCodeNextAttemptAt = nextAttemptAt;
        this.sourceWarehouseCodeLastError = normalizeSnapshotError(error);
        clearSourceWarehouseCodeClaim();
    }

    /** 복구 불가능한 warehouse 응답은 관측 가능한 격리 상태로 종결한다. */
    public void abandonSourceWarehouseCodeSnapshot(UUID claimToken, String error) {
        if (!ownsSourceWarehouseCodeClaim(claimToken)) return;
        this.sourceWarehouseCodeSnapshotStatus = WarehouseCodeSnapshotStatus.ABANDONED;
        this.sourceWarehouseCodePending = false;
        this.sourceWarehouseCodeNextAttemptAt = null;
        this.sourceWarehouseCodeLastError = normalizeSnapshotError(error);
        this.sourceWarehouseCodeAbandonedAt = LocalDateTime.now();
        clearSourceWarehouseCodeClaim();
    }

    private void clearSourceWarehouseCodeClaim() {
        this.sourceWarehouseCodeClaimedAt = null;
        this.sourceWarehouseCodeClaimToken = null;
    }

    private static String normalizeSnapshotError(String error) {
        if (error == null || error.isBlank()) return "알 수 없는 inventory snapshot 오류";
        return error.length() <= 2000 ? error : error.substring(0, 2000);
    }

    /**
     * 도착지 창고명 snapshot 갱신 — SP-08-FU2 P2-2 (V26) 신규.
     *
     * <p>inventory-service warehouse lookup 결과를 입고전표 생성/수정 시점에 snapshot.
     * 단계 가드 없음 — partner_code {@link #setPartnerCode} 와 동일한 패턴 (어떤 단계에서도 갱신 가능).
     *
     * @param destinationWarehouseName inventory-service 가 반환한 창고명. null 허용 (lookup 실패 시 유지).
     */
    public void snapshotDestinationWarehouseName(String destinationWarehouseName) {
        if (destinationWarehouseName != null) {
            this.destinationWarehouseName = destinationWarehouseName;
        }
    }

    /**
     * DeliveryBatch 연결 해제 — DeliveryBatch.removeSlip 내부에서만 호출.
     * Slice B (notification-slice-B) 신규.
     */
    public void clearBatch() {
        this.deliveryBatchId = null;
    }

    /**
     * 작성중 → 저장완료 전이. DRAFT 에서만 허용.
     *
     * @throws BusinessException(CONFLICT) 현재 상태가 DRAFT 가 아닐 때
     */
    public void save() {
        requireStatus(SlipStatus.DRAFT);
        this.status = SlipStatus.SAVED;
    }

    /**
     * 저장완료 → 전송완료 전이. SAVED 에서만 허용.
     *
     * @throws BusinessException(CONFLICT) 현재 상태가 SAVED 가 아닐 때
     */
    public void send() {
        requireStatus(SlipStatus.SAVED);
        if (this.partnerId == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "전표 전송 전 거래처를 지정해야 합니다");
        }
        this.status = SlipStatus.SENT;
        if (this.slipType != SlipType.OUTBOUND) {
            captureRevisionBaselineIfAbsent();
        }
    }

    /**
     * 커밋 상태에서 거래처 필수 불변식을 확인한다.
     *
     * <p>배포와 legacy 보정 사이에 남을 수 있는 partner_id null 전표가 다음 전이로 더 깊은
     * 회계 체인에 들어가는 것을 차단한다. 정상 전표는 {@link #send()} 단계에서 이미 통과한다.
     *
     * @throws BusinessException(INVALID_INPUT) 거래처가 없는 커밋 전표일 때
     */
    private void requirePartnerForCommitted() {
        if (this.partnerId == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "거래처 없는 전표는 이 전이를 수행할 수 없습니다");
        }
    }

    /**
     * 전송완료 → 수락 전이. SENT 에서만 허용. acceptedBy, acceptedAt 기록 +
     * Slice A (sales-polish-2): dispatcherUserId, dispatcherSignedAt 자동 기입
     * (작업지시서 결재란 출고인 셀 자동 표시 — 사용자 피드백 #9).
     *
     * @param acceptorUserId 수락자 user-id (창고/재고원). 출고인 자동 기입에도 동일 사용.
     * @throws BusinessException(CONFLICT) 현재 상태가 SENT 가 아닐 때
     */
    public void accept(String acceptorUserId) {
        requireStatus(SlipStatus.SENT);
        requirePartnerForCommitted();
        LocalDateTime now = LocalDateTime.now();
        this.status = SlipStatus.ACCEPTED;
        this.acceptedBy = acceptorUserId;
        this.acceptedAt = now;
        this.dispatcherUserId = acceptorUserId;
        this.dispatcherSignedAt = now;
    }

    /**
     * 수락 → 처리중 전이. ACCEPTED 에서만 허용.
     *
     * @throws BusinessException(CONFLICT) 현재 상태가 ACCEPTED 가 아닐 때
     */
    public void process() {
        requireStatus(SlipStatus.ACCEPTED);
        requirePartnerForCommitted();
        this.status = SlipStatus.PROCESSING;
    }

    /**
     * 처리중 → 검수중 전이 (출고 완료). PROCESSING 에서만 허용. **Slice A hotfix**: 사용자 명시
     * "출고 완료되면 검수 단계에 돌입" — 즉 complete() 가 출고 완료를 의미하며 검수 단계로 진입.
     * InventoryClient.deduct 는 SlipService.complete 가 본 도메인 메서드 호출 직후 처리.
     *
     * @throws BusinessException(CONFLICT) 현재 상태가 PROCESSING 이 아닐 때
     */
    public void complete() {
        requireStatus(SlipStatus.PROCESSING);
        requirePartnerForCommitted();
        this.status = SlipStatus.INSPECTING;
        // completedAt 은 검수 완료(inspect) 시점에 기록 — "처리완료" 의미상 검수까지 통과해야 진정한 완료.
    }

    /**
     * 검수중 → 처리완료 전이 (검수 완료). INSPECTING 에서만 허용. **Slice A hotfix**: 사용자 명시
     * "검수 단계 전표를 수락하고 확인 후 완료하면 검수 완료 처리" — 즉 inspect() 가 검수 완료를 의미.
     * inspectorUserId, inspectorSignedAt 자동 기입 + completedAt 기록 (결재란 검수인 셀 + 완료 시각).
     *
     * @param inspectorUserId 검수자 user-id (창고/검수/관리자/마스터). 4-eye 패턴 권장 —
     *     일반적으로 dispatcherUserId 와 다른 사용자 (단, 도메인 강제 X — 운영 정책).
     * @throws BusinessException(CONFLICT) 현재 상태가 INSPECTING 이 아닐 때
     */
    public void inspect(String inspectorUserId) {
        requireStatus(SlipStatus.INSPECTING);
        requirePartnerForCommitted();
        this.status = SlipStatus.COMPLETED;
        if (this.slipType == SlipType.OUTBOUND) {
            captureRevisionBaselineIfAbsent();
        }
        this.inspectorUserId = inspectorUserId;
        this.inspectorSignedAt = LocalDateTime.now();
        this.completedAt = LocalDateTime.now();
    }

    /**
     * 처리완료 → 배송중 전이 (출고전표 한정). COMPLETED 에서만 허용.
     *
     * @throws BusinessException(CONFLICT) 현재 상태가 COMPLETED 가 아니거나, slipType 이 INBOUND 일 때
     */
    public void ship() {
        requireStatus(SlipStatus.COMPLETED);
        requirePartnerForCommitted();
        if (this.slipType != SlipType.OUTBOUND) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "배송 단계는 출고전표에만 적용됩니다");
        }
        this.status = SlipStatus.SHIPPING;
    }

    /**
     * 배송중 → 배송완료 전이 (출고전표 한정). SHIPPING 에서만 허용.
     *
     * @throws BusinessException(CONFLICT) 현재 상태가 SHIPPING 이 아니거나, slipType 이 INBOUND 일 때
     */
    public void deliver() {
        requireStatus(SlipStatus.SHIPPING);
        requirePartnerForCommitted();
        if (this.slipType != SlipType.OUTBOUND) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "배송 단계는 출고전표에만 적용됩니다");
        }
        this.status = SlipStatus.DELIVERED;
    }

    /**
     * 확정 전이 — 출고전표는 DELIVERED 에서, 입고전표는 COMPLETED 에서. confirmedAt 기록.
     *
     * @throws BusinessException(CONFLICT) 출고가 DELIVERED 가 아니거나 입고가 COMPLETED 가 아닐 때
     */
    public void confirm() {
        if (this.slipType == SlipType.OUTBOUND) {
            requireStatus(SlipStatus.DELIVERED);
        } else {
            requireStatus(SlipStatus.COMPLETED);
        }
        requirePartnerForCommitted();
        this.status = SlipStatus.CONFIRMED;
        this.confirmedAt = LocalDateTime.now();
    }

    /**
     * 반려 — SENT, ACCEPTED 또는 INSPECTING 에서만 허용. 사유 텍스트가 있으면 메모 앞에 prepend.
     *
     * <p>Slice A (sales-polish-2): INSPECTING 단계도 reject 허용 — 검수자가 picking 결과 거부.
     * cancel 은 ACCEPTED 부터는 거부되므로 (CANCELABLE_STATUSES 참조) INSPECTING 단계의
     * 거부 경로는 reject 만 가능.
     *
     * @param reasonText 반려 사유 (null/blank 이면 메모 변경 없음)
     * @throws BusinessException(CONFLICT) 현재 상태가 SENT/ACCEPTED/INSPECTING 셋 다 아닐 때
     */
    public void reject(String reasonText) {
        if (this.status != SlipStatus.SENT
                && this.status != SlipStatus.ACCEPTED
                && this.status != SlipStatus.INSPECTING) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "반려 가능한 상태가 아닙니다: " + this.status.getDisplayName());
        }
        requireNotLocked();
        requirePartnerForCommitted();
        this.status = SlipStatus.REJECTED;
        if (reasonText != null && !reasonText.isBlank()) {
            String prefix = "[반려: " + reasonText + "] ";
            this.memo = (this.memo == null || this.memo.isBlank())
                    ? prefix.trim()
                    : prefix + this.memo;
        }
    }

    /**
     * 취소 — DRAFT/SAVED/SENT 에서만 허용. 그 외 단계는 운영 절차 별도 (현 슬라이스 미구현).
     *
     * <p><b>Phase 2.6c 불변 가드</b>: {@code sourceType == PARTNER_ORDER} 전환 전표는
     * 발행 즉시 SENT 상태로 고정되며 취소할 수 없다. 취소 시 inventory reserve 가 해제되지 않아
     * 재고가 영구 예약 상태로 잠기는 문제를 방지하기 위해 CONFLICT 예외를 던진다.
     *
     * <p>비-PARTNER_ORDER 전표(DRAFT/SAVED/SENT)의 취소는 기존과 동일하게 동작한다 (회귀 0).
     *
     * @throws BusinessException(CONFLICT) 현재 상태가 취소 가능 단계 밖이거나
     *                                     sourceType 이 PARTNER_ORDER 일 때
     */
    public void cancel() {
        // PARTNER_ORDER 전환 전표 불변 가드 — Phase 2.6c
        // inventory reserve 해제 없이 취소 시 재고가 영구 잠기므로 차단.
        if (SlipSourceType.PARTNER_ORDER.equals(this.sourceType)) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "주문 전환 출고전표는 취소할 수 없습니다. "
                            + "재고 예약 해제가 자동으로 수행되지 않으므로 운영 절차를 따르세요.");
        }
        if (!CANCELABLE_STATUSES.contains(this.status)) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "취소 가능한 상태가 아닙니다: " + this.status.getDisplayName());
        }
        requireNotLocked();
        this.status = SlipStatus.CANCELED;
    }

    /**
     * 매입 전표 soft delete — SP-08-5-3 신규.
     *
     * <p>처리 순서:
     * <ol>
     *   <li>slipType == INBOUND 가드 — 비-INBOUND 시 {@link ErrorCode#SLIP_DELETE_NON_INBOUND} (403)</li>
     *   <li>삭제 가능 상태 가드 — DRAFT/SAVED 만 허용, 그 외 단계는
     *       {@link ErrorCode#SLIP_DELETE_INSPECTION_COMPLETED} (422)</li>
     *   <li>{@link BaseEntity#markDeleted(String)} 호출 + 하위 라인 cascade soft-delete</li>
     * </ol>
     *
     * @param actorId 삭제 수행자 ID (audit 기록용, null 허용 → "system" 폴백)
     * @throws BusinessException(SLIP_DELETE_NON_INBOUND) slipType 이 INBOUND 가 아닐 때
     * @throws BusinessException(SLIP_DELETE_INSPECTION_COMPLETED) DRAFT/SAVED 외 단계일 때
     */
    public void deleteForPurchase(String actorId) {
        validateDeleteForPurchase();
        String deleter = (actorId == null || actorId.isBlank()) ? "system" : actorId;
        for (SlipLine line : new ArrayList<>(this.lines)) {
            line.markDeleted(deleter);
        }
        this.lines.clear();
        this.markDeleted(deleter);
    }

    /** 삭제 전에 타입·라이프사이클 가드만 평가한다. 상태 변경은 하지 않는다. */
    public void validateDeleteForPurchase() {
        if (this.slipType != SlipType.INBOUND) {
            throw new BusinessException(ErrorCode.SLIP_DELETE_NON_INBOUND,
                    ErrorCode.SLIP_DELETE_NON_INBOUND.getDefaultMessage());
        }
        if (!EDITABLE_STATUSES.contains(this.status)) {
            throw new BusinessException(ErrorCode.SLIP_DELETE_INSPECTION_COMPLETED,
                    ErrorCode.SLIP_DELETE_INSPECTION_COMPLETED.getDefaultMessage());
        }
    }

    /**
     * 매출 전표 soft delete — SP-08-6-3 신규.
     *
     * <p>처리 순서:
     * <ol>
     *   <li>slipType == OUTBOUND 가드 — 비-OUTBOUND 시 {@link ErrorCode#SLIP_DELETE_NON_SALES} (403)</li>
     *   <li>삭제 가능 상태 가드 — DRAFT/SAVED 만 허용, 출고 진행(SENT 이후) 단계는
     *       {@link ErrorCode#SLIP_DELETE_SALES_SHIPPED} (422)</li>
     *   <li>마감 lock 가드 — {@link #requireNotLocked()} 호출 (lock_flag=true 이면 CONFLICT)</li>
     *   <li>{@link com.samhanair.logis.common.entity.BaseEntity#markDeleted(String)} 호출 +
     *       하위 라인 cascade soft-delete</li>
     * </ol>
     *
     * @param actorId 삭제 수행자 ID (audit 기록용, null 허용 → "system" 폴백)
     * @throws BusinessException(SLIP_DELETE_NON_SALES)     slipType 이 OUTBOUND 가 아닐 때
     * @throws BusinessException(SLIP_DELETE_SALES_SHIPPED) DRAFT/SAVED 외 출고 진행 단계일 때
     * @throws BusinessException(CONFLICT)                  마감 lock 적용 슬립 (lock_flag=true)
     */
    public void deleteForSales(String actorId) {
        deleteForSales(actorId, null);
    }

    /**
     * 매출 전표 soft delete — 삭제자 표시명을 함께 저장한다.
     *
     * <p><b>단일 시각 각인 (#758 머지게이트 감사 HIGH fix)</b>: {@code LocalDateTime.now()} 를
     * 이 메서드에서 <b>한 번만</b> 캡처해 헤더와 cascade 되는 모든 라인에 동일하게 주입한다.
     * {@link com.samhanair.logis.slip.service.SlipRestoreService#restore} 가 "이 삭제 작업으로
     * cascade 된 라인" 을 {@code deletedAt} 등호 매칭으로 정확히 식별해 복원할 수 있도록 하기
     * 위함이다 — 각자 {@code now()} 를 따로 찍으면 이 매칭이 불가능해 편집으로 이미 개별
     * soft-delete 된 라인(예: {@code removeLine}/{@code replaceSalesLines}/
     * {@code restoreFromSnapshot})까지 함께 부활한다(#758 CRITICAL 재현). 이들 편집 경로의
     * {@code markDeleted(deleter)}(1-arg, 각자 {@code now()}) 호출은 의도적으로 그대로 둔다
     * (PartnerOrder(C) #757 R2 정합 패턴).
     *
     * @param actorId 삭제 수행자 ID (audit 기록용, null 허용 → "system" 폴백)
     * @param actorName 삭제자 표시명 (UUID 비노출용, null 허용)
     * @throws BusinessException(SLIP_DELETE_NON_SALES)     slipType 이 OUTBOUND 가 아닐 때
     * @throws BusinessException(SLIP_DELETE_SALES_SHIPPED) DRAFT/SAVED 외 출고 진행 단계일 때
     * @throws BusinessException(CONFLICT)                  마감 lock 적용 슬립 (lock_flag=true)
     */
    public void deleteForSales(String actorId, String actorName) {
        validateDeleteForSales();
        String deleter = (actorId == null || actorId.isBlank()) ? "system" : actorId;
        LocalDateTime now = LocalDateTime.now();
        for (SlipLine line : new ArrayList<>(this.lines)) {
            line.markDeleted(deleter, now);
        }
        this.lines.clear();
        this.markDeleted(deleter, now);
        this.deletedByName = sanitizeDeletedByName(actorName);
    }

    /** 삭제 전에 타입·라이프사이클·마감 lock 가드만 평가한다. 상태 변경은 하지 않는다. */
    public void validateDeleteForSales() {
        if (this.slipType != SlipType.OUTBOUND) {
            throw new BusinessException(ErrorCode.SLIP_DELETE_NON_SALES,
                    ErrorCode.SLIP_DELETE_NON_SALES.getDefaultMessage());
        }
        if (!EDITABLE_STATUSES.contains(this.status)) {
            throw new BusinessException(ErrorCode.SLIP_DELETE_SALES_SHIPPED,
                    ErrorCode.SLIP_DELETE_SALES_SHIPPED.getDefaultMessage());
        }
        requireNotLocked();
        // 단일 시각 각인(#758 머지게이트 감사 HIGH fix) — 헤더/라인이 동일 deletedAt 을 가져야
        // 복원(SlipRestoreService) 이 deletedAt 등호 매칭으로 이 삭제 작업의 라인만 식별한다.
        // removeLine/replaceLines/replaceSalesLines/restoreFromSnapshot 의 markDeleted(deleter)
        // (1-arg, 각자 now()) 는 편집 경로라 복원 대상에서 배제되어야 하므로 그대로 둔다.
    }

    /** soft-delete 복원 후 사용자 표시용 삭제자명을 비운다. */
    public void markRestoredWithNameCleared() {
        markRestored();
        this.deletedByName = null;
    }

    /**
     * 회계 마감 lock 적용 — V14 migration 신규.
     *
     * <p>accounting-service 호출 ({@code POST /internal/slips/lock-by-period}) 시점에 SlipService 가
     * 일괄 호출. CONFIRMED 슬립만 lock 권장 (운영 정책 — 도메인 강제 X, service 레이어 가드).
     * 이미 lock 된 슬립은 재호출 idempotent (no-op).
     */
    public void lock() {
        this.lockFlag = Boolean.TRUE;
    }

    /**
     * 회계 마감 lock 해제 — 운영 권한자 한정 (현 슬라이스 미공개 endpoint).
     */
    public void unlock() {
        this.lockFlag = Boolean.FALSE;
    }

    /**
     * 마감 lock 가드 — reject / cancel 등 mutation 직전에 호출.
     *
     * @throws BusinessException(CONFLICT) lock_flag = true 일 때
     */
    private void requireNotLocked() {
        if (Boolean.TRUE.equals(this.lockFlag)) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "마감 처리된 슬립은 변경할 수 없습니다 (lock_flag=true)");
        }
    }

    // ---------- Slice C (signature-slice-C) — 인수자 전자서명 라이프사이클 ----------

    /**
     * 인수자 서명 등록 — Slice C (signature-slice-C Plan §1.3 Layer 4 라이프사이클 표).
     *
     * <p>전이 가드: 현재 status 가 {@link SlipStatus#INSPECTING} / {@link SlipStatus#COMPLETED} /
     * {@link SlipStatus#SHIPPING} 중 하나여야 함. 그 외 단계는 CONFLICT (409).
     *
     * <p>부수효과 (현재 트랜잭션 내):
     * <ol>
     *   <li>{@code signedAt = now()}</li>
     *   <li>{@code signerName, signaturePng, signatureHash, signatureChannel} 갱신</li>
     *   <li>{@code signatureShareToken} 신규 발급 (base64url 64자, 매 호출마다 재생성)</li>
     *   <li>{@code signatureShareExpiresAt = signedAt + 30일} (Q4)</li>
     *   <li>SlipStatus 자체는 **변경 없음** — 서명은 라이프사이클 직교 메타 (Q3)</li>
     * </ol>
     *
     * <p>audit 적재는 service 레이어에서 별도로 처리 (도메인은 entity 만 반환, service 가 repository 로
     * 저장). audit log 는 entity 가 아니라 service 에서 INSERT — 도메인은 순수 mutation 만.
     *
     * @param signerName 인수자명 (1~50자, 필수)
     * @param png 서명 PNG bytes (필수, ≤50KB — service 레이어 가드)
     * @param hash 서명 SHA-256 hex 64자 (서버 재계산값과 일치해야 함 — service 레이어 검증)
     * @param channel 서명 채널 (필수)
     * @throws BusinessException(CONFLICT) 현재 상태가 SIGNABLE_STATUSES 안에 없을 때
     * @throws IllegalArgumentException signerName/png/hash/channel null/blank 또는 길이 위반
     */
    public void recordSignature(String signerName, byte[] png, String hash, SignatureChannel channel) {
        recordSignature(signerName, png, hash, channel, SignatureSource.LINK);
    }

    /**
     * 인수자 서명 등록 (W10-4 source overload) — 기존 4-arg 시그니처 보존 + source 명시.
     *
     * <p>본 4+1 arg 메서드가 1차 도메인 진입점. 기존 4-arg 메서드는 source=LINK 로 본 메서드 위임.
     *
     * @param signerName 인수자명 (1~50자, 필수)
     * @param png 서명 PNG bytes (필수, ≤50KB)
     * @param hash 서명 SHA-256 hex 64자
     * @param channel 서명 채널 (필수)
     * @param source 서명 발급 source (필수) — LINK (공개 모바일) 또는 APP (arologis 어플)
     * @throws BusinessException(CONFLICT) 현재 상태가 SIGNABLE_STATUSES 안에 없을 때
     * @throws IllegalArgumentException signerName/png/hash/channel/source null/blank 또는 길이 위반
     */
    public void recordSignature(String signerName, byte[] png, String hash, SignatureChannel channel,
                                SignatureSource source) {
        if (!SIGNABLE_STATUSES.contains(this.status)) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "서명 가능한 단계가 아닙니다 (현재: " + this.status.getDisplayName()
                            + ", 필요: 검수중/처리완료/배송중)");
        }
        if (signerName == null || signerName.isBlank()) {
            throw new IllegalArgumentException("signerName 은 필수입니다");
        }
        if (signerName.length() > 50) {
            throw new IllegalArgumentException("signerName 은 최대 50자입니다");
        }
        if (png == null || png.length == 0) {
            throw new IllegalArgumentException("signaturePng 은 필수입니다");
        }
        if (hash == null || hash.isBlank()) {
            throw new IllegalArgumentException("signatureHash 는 필수입니다");
        }
        if (channel == null) {
            throw new IllegalArgumentException("signatureChannel 은 필수입니다");
        }
        if (source == null) {
            throw new IllegalArgumentException("signatureSource 는 필수입니다");
        }

        LocalDateTime now = LocalDateTime.now();
        this.signedAt = now;
        this.signerName = signerName;
        this.signaturePng = png;
        this.signatureHash = hash;
        this.signatureChannel = channel;
        this.signatureSource = source;
        this.signatureShareToken = generateShareToken();
        this.signatureShareExpiresAt = now.plusDays(SIGNATURE_SHARE_EXPIRY_DAYS);
    }

    /**
     * 인수자 서명 무효화 — Slice C (signature-slice-C Plan §1.3 라이프사이클 표).
     * MASTER 권한자만 호출 (service 레이어 PreAuthorize 가드).
     *
     * <p>전이 가드: {@code signedAt != null} 일 때만 호출 가능. 미서명 상태에서 호출 시 CONFLICT.
     *
     * <p>부수효과:
     * <ol>
     *   <li>5필드 모두 NULL: signedAt / signerName / signaturePng / signatureHash / signatureChannel</li>
     *   <li>share 토큰/만료 시각도 NULL — share URL 즉시 무효</li>
     *   <li>SlipStatus 변경 없음</li>
     *   <li>audit 적재는 service 레이어 (INVALIDATE action + reason + actorUserId)</li>
     * </ol>
     *
     * <p>service 레이어가 audit INSERT 시 사용할 직전 hash/signerName 정보는 본 메서드 호출 **전에**
     * 외부에서 snapshot 해야 함 (호출 후 NULL 이 됨). service 레이어에서 호출 순서 가드.
     *
     * @param reason 무효화 사유 (필수, ≤500자)
     * @throws BusinessException(CONFLICT) signedAt 가 null 일 때
     * @throws IllegalArgumentException reason null/blank 또는 500자 초과
     */
    public void invalidateSignature(String reason) {
        if (this.signedAt == null) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "서명되지 않은 슬립은 무효화할 수 없습니다");
        }
        if (reason == null || reason.isBlank()) {
            throw new IllegalArgumentException("reason 은 필수입니다");
        }
        if (reason.length() > 500) {
            throw new IllegalArgumentException("reason 은 최대 500자입니다");
        }

        this.signedAt = null;
        this.signerName = null;
        this.signaturePng = null;
        this.signatureHash = null;
        this.signatureChannel = null;
        this.signatureShareToken = null;
        this.signatureShareExpiresAt = null;
        // W10-4: source 는 NOT NULL DEFAULT 'LINK' — invalidate 시 LINK 로 reset (신규 발급 가능 상태).
        this.signatureSource = SignatureSource.LINK;
    }

    /**
     * 인수자 share 토큰이 만료되었는지 검증 — 인수자 view 공개 endpoint 가드.
     *
     * @return true 면 만료, false 이면 유효 또는 미서명 (token 자체가 null)
     */
    public boolean isSignatureShareExpired() {
        if (this.signatureShareExpiresAt == null) {
            return true;
        }
        return LocalDateTime.now().isAfter(this.signatureShareExpiresAt);
    }

    /** 서명이 등록된 슬립인지 — admin 화면 / FE 표시 분기 헬퍼. */
    public boolean isSigned() {
        return this.signedAt != null;
    }

    /**
     * 배송기사 서명 기록 — Slice C2 (PR #23 follow-up).
     *
     * 인수자 서명({@link #recordSignature})과 동일한 SIGNABLE_STATUSES 가드 + 검증 패턴.
     * 차이: signerName 별도 입력 X (Slip.driverName 재사용), share token 발급 X
     * (인수자 share 토큰이 둘 다 표시).
     *
     * @throws BusinessException(CONFLICT) 현재 상태가 SIGNABLE_STATUSES 안에 없을 때
     * @throws IllegalArgumentException png/hash/channel null 또는 길이 위반
     */
    public void recordDriverSignature(byte[] png, String hash, SignatureChannel channel) {
        recordDriverSignature(png, hash, channel, SignatureSource.LINK);
    }

    /**
     * 기사 서명 등록 (W10-4 source overload) — 기존 3-arg 시그니처 보존 + source 명시.
     *
     * <p>arologis driver-app 직접 캡처 호출 시 source=APP. SMS/Aligo 공개 모바일 endpoint 시 LINK.
     *
     * @param png 서명 PNG bytes (필수)
     * @param hash 서명 SHA-256 hex 64자
     * @param channel 서명 채널 (필수)
     * @param source 서명 발급 source (필수) — LINK 또는 APP
     */
    public void recordDriverSignature(byte[] png, String hash, SignatureChannel channel,
                                      SignatureSource source) {
        if (!SIGNABLE_STATUSES.contains(this.status)) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "기사 서명 가능한 단계가 아닙니다 (현재: " + this.status.getDisplayName()
                            + ", 필요: 검수중/처리완료/배송중)");
        }
        if (png == null || png.length == 0) {
            throw new IllegalArgumentException("driverSignaturePng 은 필수입니다");
        }
        if (hash == null || hash.isBlank()) {
            throw new IllegalArgumentException("driverSignatureHash 는 필수입니다");
        }
        if (channel == null) {
            throw new IllegalArgumentException("driverSignatureChannel 은 필수입니다");
        }
        if (source == null) {
            throw new IllegalArgumentException("driverSignatureSource 는 필수입니다");
        }
        this.driverSignedAt = LocalDateTime.now();
        this.driverSignaturePng = png;
        this.driverSignatureHash = hash;
        this.driverSignatureChannel = channel;
        this.driverSignatureSource = source;
    }

    /** 기사 서명 등록 여부 — DispatchView 인쇄 분기 헬퍼. */
    public boolean isDriverSigned() {
        return this.driverSignedAt != null;
    }

    // ---------- Phase 6 M5 (slip-service-integration) — 발행 출처 + idempotency ----------

    /**
     * 전표 발행 출처 — Phase 6 M5 신규. {@link SlipSourceType} 참고.
     * 기본값 {@link SlipSourceType#MANUAL} (V7 migration 의 DB DEFAULT).
     * estimate-app / partner-order-service 가 호출한 신규 endpoint 만 이 값을 변경한다.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "source_type", length = 32, nullable = false)
    private SlipSourceType sourceType = SlipSourceType.MANUAL;

    /**
     * 출처 비즈니스 식별자 — Phase 6 M5 신규.
     * <ul>
     *   <li>ESTIMATE → estimateNumber (legacy 견적 번호 문자열)</li>
     *   <li>PARTNER_ORDER → partnerOrderId (UUID 문자열)</li>
     *   <li>MIGRATED_ECOUNT → 원본 ecount 전표 번호</li>
     *   <li>MANUAL → null</li>
     * </ul>
     * {@code (source_type, source_id)} 복합 인덱스로 idempotency 보조 조회 ({@code GET /by-source}).
     */
    @Column(name = "source_id", length = 64)
    private String sourceId;

    /**
     * 호출자 발급 idempotency 키 — Phase 6 M5 신규.
     * 같은 키 + 같은 본문 → 200 (기존 slipNo). 같은 키 + 다른 본문 → 409 Conflict.
     * partial UNIQUE INDEX ({@code WHERE idempotency_key IS NOT NULL AND is_deleted=FALSE})
     * 가 동시 충돌을 DB 레벨에서 차단 (3중 격리의 1단계).
     */
    @Column(name = "idempotency_key", length = 128)
    private String idempotencyKey;

    /**
     * 발행 출처 메타데이터 일괄 설정 — SlipPublishService 가 신규 슬립 생성 후 호출.
     * 본 메서드는 1회성 setter (재호출 시 BusinessException(CONFLICT)) — 출처는 발행 시점에 확정.
     *
     * @param sourceType 출처 유형 (필수)
     * @param sourceId 비즈니스 식별자 (estimate/order 인 경우 필수, MANUAL 이면 null 허용)
     * @param idempotencyKey 호출자 발급 키 (선택, null 이면 idempotency 보호 없이 일반 슬립으로 저장)
     * @throws com.samhanair.logis.common.exception.BusinessException (CONFLICT) 이미 sourceType 이 설정되어 있고 MANUAL 이 아닐 때
     * @throws IllegalArgumentException sourceType 이 null 일 때
     */
    public void assignPublishSource(SlipSourceType sourceType, String sourceId, String idempotencyKey) {
        if (sourceType == null) {
            throw new IllegalArgumentException("sourceType 은 필수입니다");
        }
        if (this.sourceType != null && this.sourceType != SlipSourceType.MANUAL) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 발행 출처가 설정된 슬립입니다: " + this.sourceType.getDisplayName());
        }
        this.sourceType = sourceType;
        this.sourceId = sourceId;
        this.idempotencyKey = idempotencyKey;
    }

    /**
     * e-Count schema snapshot 일괄 설정 — V16 (PR-G1) 신규.
     *
     * <p>{@code SlipPublishService} 가 신규 슬립 생성 후 호출. memo 1000자 prepend 정책 폐기 →
     * 각 의미 단위를 별도 컬럼에 직접 저장. legacy GAS 의 e-Count BulkDatas 14 필드 중 12 필드
     * (io_type, time_date, customer_tel/address/representative, shipping_address,
     * inspection_address, receiver_phone, payment_due_label, discount_info, collect_term, agree_term).
     *
     * <p>본 메서드는 단순 setter — 라이프사이클 단계 가드 없음 (어떤 단계에서도 snapshot 갱신 가능).
     * 호출자가 null 인자를 전달하면 해당 필드는 변경 없음 (보존).
     *
     * @param ioType {@code "10"}=출고 / {@code "11"}=입고. null 이면 기존 값 보존.
     * @param timeDate HHmmss. null 이면 보존.
     * @param customerTel 거래처 연락처. null 이면 보존.
     * @param customerAddress 거래처 사업장 주소. null 이면 보존.
     * @param customerRepresentative 거래처 대표자명. null 이면 보존.
     * @param shippingAddress 배송지 주소. null 이면 보존.
     * @param inspectionAddress 검수지 주소. null 이면 보존.
     * @param receiverPhone 수령자 연락처. null 이면 보존.
     * @param paymentDueLabel 결제 만기 라벨. null 이면 보존.
     * @param discountInfo 할인 정보. null 이면 보존.
     * @param collectTerm 대금 회수 조건. null 이면 보존.
     * @param agreeTerm 거래 약정 조건. null 이면 보존.
     */
    public void applyEcountSchema(String ioType, String timeDate,
                                  String customerTel, String customerAddress,
                                  String customerRepresentative,
                                  String shippingAddress, String inspectionAddress,
                                  String receiverPhone, String paymentDueLabel,
                                  String discountInfo, String collectTerm, String agreeTerm) {
        if (ioType != null) {
            this.ioType = ioType;
        }
        if (timeDate != null) {
            this.timeDate = timeDate;
        }
        if (customerTel != null) {
            this.customerTel = customerTel;
        }
        if (customerAddress != null) {
            this.customerAddress = customerAddress;
        }
        if (customerRepresentative != null) {
            this.customerRepresentative = customerRepresentative;
        }
        if (shippingAddress != null) {
            this.shippingAddress = shippingAddress;
        }
        if (inspectionAddress != null) {
            this.inspectionAddress = inspectionAddress;
        }
        if (receiverPhone != null) {
            this.receiverPhone = receiverPhone;
        }
        if (paymentDueLabel != null) {
            this.paymentDueLabel = paymentDueLabel;
        }
        if (discountInfo != null) {
            this.discountInfo = discountInfo;
        }
        if (collectTerm != null) {
            this.collectTerm = collectTerm;
        }
        if (agreeTerm != null) {
            this.agreeTerm = agreeTerm;
        }
    }

    // ---------- V20 도메인 메서드 — 판매/구매조회 확장 필드 ----------

    /**
     * 인쇄 시각 기록 — 서버 timestamp 를 {@link #printedAt} 에 기입한다.
     *
     * <p>최초 인쇄 시 호출. 재호출 시에도 timestamp 가 갱신되며, 판매/구매조회 화면의
     * "인쇄여부" 컬럼은 {@code printedAt != null} 로 판단하므로 재인쇄는 이미 "인쇄됨" 상태.
     *
     * <p>라이프사이클 단계 가드 없음 — 어떤 단계에서도 인쇄 가능 (운영 정책).
     */
    public void recordPrint() {
        this.printedAt = LocalDateTime.now();
    }

    /**
     * 프로젝트 관련 정보 일괄 적용 — 판매/구매조회 화면의 주요 신규 필드를 한 번에 설정한다.
     *
     * <p>null 인 인자는 기존 값 보존 (부분 갱신 패턴). 도메인 메서드를 통해서만 해당 필드를
     * 수정하여 직접 setter 호출을 방지한다 (프로젝트 컨벤션).
     *
     * @param businessNumber 사업자등록번호 snapshot (null 이면 보존)
     * @param deliveryAddress 배송주소 (null 이면 보존)
     * @param supervisionAddress 감리주소 (null 이면 보존)
     * @param projectName 프로젝트명 (null 이면 보존)
     * @param recipientPhone 인수자 번호 (null 이면 보존)
     * @param paymentDueDate 입금예정일 (null 이면 보존)
     */
    public void withProjectInfo(String businessNumber, String deliveryAddress,
                                String supervisionAddress, String projectName,
                                String recipientPhone, LocalDate paymentDueDate) {
        if (businessNumber != null) {
            this.businessNumber = businessNumber;
        }
        if (deliveryAddress != null) {
            this.deliveryAddress = deliveryAddress;
        }
        if (supervisionAddress != null) {
            this.supervisionAddress = supervisionAddress;
        }
        if (projectName != null) {
            this.projectName = projectName;
        }
        if (recipientPhone != null) {
            this.recipientPhone = recipientPhone;
        }
        if (paymentDueDate != null) {
            this.paymentDueDate = paymentDueDate;
        }
    }

    /**
     * 사업자등록번호 snapshot 단독 갱신 — partner-service Feign lookup 결과 적용용.
     *
     * <p>partnerCode({@link #setPartnerCode}) 와 동일 패턴 — 후속 슬라이스에서 partner-service
     * 연동 시 본 메서드로 개별 채움. 기존 {@link #withProjectInfo} 와 병행 사용 가능.
     *
     * @param businessNumber 사업자등록번호 문자열 (예: "123-45-67890")
     */
    public void setBusinessNumber(String businessNumber) {
        this.businessNumber = businessNumber;
    }

    private static String generateShareToken() {
        byte[] bytes = new byte[SIGNATURE_TOKEN_BYTE_LENGTH];
        SIGNATURE_RNG.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /**
     * 배송일정 적용 — 하차일(N) 계산 및 저장.
     *
     * <p>M = {@link #slipDate} (잠금, 변경 불가). N은 본 메서드가 관리한다.
     *
     * <p>처리 우선순위:
     * <ol>
     *   <li>{@code override != null} → {@code unloadDate = override} (사용자 직접 지정; 당착 = slipDate)</li>
     *   <li>{@code override == null} → {@code unloadDate = DeliverySchedule.computeUnloadDate(slipDate, tag)}</li>
     * </ol>
     *
     * <p>비적용 태그(지방/야적 외) 또는 태그 null 이면 {@code unloadDate = null} (배송일정 없음).
     *
     * @param tag 배송 태그 (지방/야적 이외면 unloadDate null 처리)
     * @param override 사용자 직접 지정 하차일 N (null 이면 규칙 자동 계산)
     */
    public void applyDeliverySchedule(DeliveryTag tag, LocalDate override) {
        // 비적용 태그(지방/야적 외) 또는 tag null 이면 unloadDate null — 데이터 오염 방지.
        if (!DeliverySchedule.isScheduled(tag)) {
            this.unloadDate = null;
            return;
        }
        this.unloadDate = (override != null)
                ? override
                : DeliverySchedule.computeUnloadDate(this.slipDate, tag);
    }

    /**
     * 현재 상태가 편집 가능한 단계(DRAFT/SAVED) 인지 여부 — 서비스 레이어 가드 헬퍼.
     *
     * @return true 면 editHeader / addLine / removeLine / editLine 허용
     */
    public boolean isEditable() {
        return EDITABLE_STATUSES.contains(this.status);
    }

    /**
     * 라인 수정/추가/삭제가 가능한지 가드 — 불가능하면 즉시 CONFLICT 던짐.
     *
     * @throws BusinessException(CONFLICT) 현재 상태가 DRAFT/SAVED 가 아닐 때
     */
    public void requireEditable() {
        if (!isEditable()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "라인 수정 가능한 상태가 아닙니다: " + this.status.getDisplayName());
        }
    }

    private void requireStatus(SlipStatus expected) {
        if (this.status != expected) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "전이 가능한 상태가 아닙니다: 현재 " + this.status.getDisplayName()
                            + ", 필요 " + expected.getDisplayName());
        }
    }

    private static String sanitizeDeletedByName(String actorName) {
        String resolved = ActorDisplayName.resolveNullable(null, actorName);
        return resolved == null ? null : resolved.substring(0, Math.min(resolved.length(), 100));
    }

    // ---------- PR-H2 (Phase 12 Step 2) — audit overlay 보조 ----------

    /**
     * 누적 수정 횟수 +1 — PR-H2 V18 신규. 같은 트랜잭션의 다중 필드 변경은 service 레이어에서
     * 1회만 호출하여 audit log 의 revision_no 그룹핑을 유지.
     *
     * @return 증가된 신규 revisionCount (= audit log 의 revision_no)
     */
    public int incrementRevision() {
        if (this.revisionCount == null) {
            this.revisionCount = 0;
        }
        this.revisionCount = this.revisionCount + 1;
        return this.revisionCount;
    }

    /**
     * S2c — 사용자 노출 수정 카운트 기준선을 1회만 기록한다.
     *
     * <p>상태 전이 자체는 콘텐츠 편집이 아니므로 revision 을 증가시키지 않고, 전이 직전까지 누적된
     * 드래프트 편집 revisionCount 를 표시 카운트 차감 기준으로 보존한다.
     */
    private void captureRevisionBaselineIfAbsent() {
        if (this.revisionCountBaseline == null) {
            this.revisionCountBaseline = this.revisionCount == null ? 0 : this.revisionCount;
        }
    }

    /**
     * S2d-1 — 임계 전이 시점 max slip_revisions.revision_no 를 레드라인 anchor 로 1회 기록한다.
     *
     * @param maxRevisionNo 임계 전이 시점까지 저장된 최대 revisionNo
     */
    public void captureRedlineAnchorIfAbsent(int maxRevisionNo) {
        if (this.redlineAnchorRevisionNo == null) {
            this.redlineAnchorRevisionNo = maxRevisionNo;
        }
    }

    /**
     * S2c — 전표수정내역 사용자 표시 카운트.
     *
     * <p>{@link #revisionCount} 는 감사 revisionNo 로 계속 증가시키고, 본 메서드만 임계 전이 전
     * 드래프트 편집분을 제외한다.
     *
     * @return 임계 전이 전이면 0, 전이 후면 {@code max(0, revisionCount - baseline)}
     */
    public int editHistoryCount() {
        if (this.revisionCountBaseline == null) {
            return 0;
        }
        int currentRevisionCount = this.revisionCount == null ? 0 : this.revisionCount;
        return Math.max(0, currentRevisionCount - this.revisionCountBaseline);
    }

    /**
     * 라이프사이클 가드 없는 단일 필드 setter — PR-H2 audit revert 용. service 레이어가 권한
     * 가드 + audit log INSERT 를 책임짐. 도메인은 순수 mutation 만.
     *
     * <p><b>주의</b>: 본 메서드는 audit revert 경로 한정. 일반 mutation 은 {@link #editHeader}
     * 등 라이프사이클 가드 메서드를 사용. revert 는 마감 lock 가드만 적용 (lockFlag=true 면 거부).
     *
     * <p>지원 필드 (PR-H2 시범 한정 — overlay 의 모든 영역 확장은 PR-H4):
     * <ul>
     *   <li>{@code memo} — 자유 메모 (≤1000자)</li>
     *   <li>{@code shippingAddress} — 배송지 주소 (≤500자)</li>
     *   <li>{@code inspectionAddress} — 검수지 주소 (≤500자)</li>
     *   <li>{@code receiverPhone} — 수령자 연락처 (≤50자)</li>
     *   <li>{@code customerTel} — 거래처 연락처 (≤50자)</li>
     *   <li>{@code customerAddress} — 거래처 주소 (≤500자)</li>
     *   <li>{@code customerRepresentative} — 거래처 대표자명 (≤100자)</li>
     *   <li>{@code paymentDueLabel} — 결제 만기 라벨 (≤20자)</li>
     *   <li>{@code discountInfo} — 할인 정보 (≤200자)</li>
     *   <li>{@code collectTerm} — 대금 회수 조건 (≤50자)</li>
     *   <li>{@code agreeTerm} — 거래 약정 조건 (≤50자)</li>
     * </ul>
     *
     * @param fieldName 필드 식별자
     * @param value 새 값 (null 허용 — 필드 clear)
     * @throws BusinessException(INVALID_INPUT) 미지원 필드 또는 길이 초과
     * @throws BusinessException(CONFLICT) 마감 lock 적용 슬립
     */
    public void applyOverlayPatch(String fieldName, String value) {
        requireNotLocked();
        if (fieldName == null || fieldName.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "fieldName 은 필수입니다");
        }
        switch (fieldName) {
            case "memo" -> {
                requireMaxLen(value, 1000, "memo");
                this.memo = value;
            }
            case "shippingAddress" -> {
                requireMaxLen(value, 500, "shippingAddress");
                this.shippingAddress = value;
            }
            case "inspectionAddress" -> {
                requireMaxLen(value, 500, "inspectionAddress");
                this.inspectionAddress = value;
            }
            case "receiverPhone" -> {
                requireMaxLen(value, 50, "receiverPhone");
                this.receiverPhone = value;
            }
            case "customerTel" -> {
                requireMaxLen(value, 50, "customerTel");
                this.customerTel = value;
            }
            case "customerAddress" -> {
                requireMaxLen(value, 500, "customerAddress");
                this.customerAddress = value;
            }
            case "customerRepresentative" -> {
                requireMaxLen(value, 100, "customerRepresentative");
                this.customerRepresentative = value;
            }
            case "paymentDueLabel" -> {
                requireMaxLen(value, 20, "paymentDueLabel");
                this.paymentDueLabel = value;
            }
            case "discountInfo" -> {
                requireMaxLen(value, 200, "discountInfo");
                this.discountInfo = value;
            }
            case "collectTerm" -> {
                requireMaxLen(value, 50, "collectTerm");
                this.collectTerm = value;
            }
            case "agreeTerm" -> {
                requireMaxLen(value, 50, "agreeTerm");
                this.agreeTerm = value;
            }
            default -> throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "지원하지 않는 audit overlay 필드입니다: " + fieldName
                            + " (PR-H2 시범 한정 — PR-H4 에서 확장 예정)");
        }
    }

    /**
     * 현재 슬립의 audit overlay 가능 필드 값을 read — service 레이어 diff 계산 + revert 시 snapshot.
     *
     * @param fieldName 필드 식별자 (applyOverlayPatch 와 동일 set)
     * @return 현재 값 (null 가능)
     * @throws BusinessException(INVALID_INPUT) 미지원 필드
     */
    public String readOverlayField(String fieldName) {
        if (fieldName == null) {
            return null;
        }
        return switch (fieldName) {
            case "memo" -> this.memo;
            case "shippingAddress" -> this.shippingAddress;
            case "inspectionAddress" -> this.inspectionAddress;
            case "receiverPhone" -> this.receiverPhone;
            case "customerTel" -> this.customerTel;
            case "customerAddress" -> this.customerAddress;
            case "customerRepresentative" -> this.customerRepresentative;
            case "paymentDueLabel" -> this.paymentDueLabel;
            case "discountInfo" -> this.discountInfo;
            case "collectTerm" -> this.collectTerm;
            case "agreeTerm" -> this.agreeTerm;
            default -> throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "지원하지 않는 audit overlay 필드입니다: " + fieldName);
        };
    }

    private static void requireMaxLen(String value, int max, String label) {
        if (value != null && value.length() > max) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    label + " 는 최대 " + max + "자입니다 (현재: " + value.length() + ")");
        }
    }

    // ---------- Samhan Public 배차 메뉴 Phase A (D-DB-04) — slip 배차 전이 ----------

    /**
     * UNDISPATCHED → DISPATCHING. 배차 완료 trigger 시점에 호출.
     * Phase A Mock 환경에서도 idempotent 가드 (이미 DISPATCHING 인 경우 no-op).
     */
    public void markDispatchPending() {
        if (this.dispatchStatus == com.samhanair.logis.slip.domain.dispatch.SlipDispatchStatus.DISPATCHED) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 " + this.dispatchStatus.getDisplayName() + " 상태인 전표는 다시 배차 발송할 수 없습니다.");
        }
        this.dispatchStatus = com.samhanair.logis.slip.domain.dispatch.SlipDispatchStatus.DISPATCHING;
    }

    /**
     * DISPATCHING → DISPATCHED. arologis confirm 회신 시점에 호출.
     */
    public void markDispatchConfirmed() {
        this.dispatchStatus = com.samhanair.logis.slip.domain.dispatch.SlipDispatchStatus.DISPATCHED;
    }

    /**
     * DISPATCHING → UNDISPATCHED. arologis unavailable 회신 시점에 호출 (재배차 대기).
     */
    public void markDispatchReleased() {
        if (this.dispatchStatus == com.samhanair.logis.slip.domain.dispatch.SlipDispatchStatus.DISPATCHED) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 " + this.dispatchStatus.getDisplayName() + " 상태인 전표는 미배차 상태로 복귀할 수 없습니다.");
        }
        this.dispatchStatus = com.samhanair.logis.slip.domain.dispatch.SlipDispatchStatus.UNDISPATCHED;
    }

    /**
     * 타배송사 직접 발송 — async 회신 없이 UNDISPATCHED → DISPATCHED 로 종료한다.
     *
     * <p>SMS 발송 성공 이후에만 호출해야 하며, 이미 배차 중/완료 상태인 전표는 중복 발송을 막기 위해
     * 409 충돌로 거부한다.
     */
    public void markDispatchedExternally() {
        if (this.dispatchStatus != com.samhanair.logis.slip.domain.dispatch.SlipDispatchStatus.UNDISPATCHED) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "미배차 상태의 전표만 타배송사 발송 완료로 전이할 수 있습니다.");
        }
        this.dispatchStatus = com.samhanair.logis.slip.domain.dispatch.SlipDispatchStatus.DISPATCHED;
    }

    /**
     * DISPATCHED → UNDISPATCHED. Samhan Public 배차 취소 흐름 Phase C 의 CANCEL_ACCEPTED 시점에 호출
     * (D-DC-05). DispatchTask 의 매핑된 모든 slip 을 미배차 풀로 복귀시킨다.
     *
     * <p>{@link #markDispatchReleased()} 와 달리 DISPATCHED 에서의 복귀를 허용한다 (취소 = 명시적 의도).
     */
    public void markDispatchCancelled() {
        this.dispatchStatus = com.samhanair.logis.slip.domain.dispatch.SlipDispatchStatus.UNDISPATCHED;
    }

    /**
     * 현 전표 상태를 버전이력용 full-snapshot 으로 변환한다 (권한 재편 Phase 2.1 Task 2).
     *
     * <p>헤더 필드(거래처/배송지/프로젝트 등)와 미삭제 라인 전체를 한 시점의 불변
     * {@link SlipSnapshot} 으로 캡처한다. {@code slip_revisions.snapshot} (JSONB) 직렬화 대상이며,
     * point-in-time 복원 시 이 스냅샷을 역직렬화해 헤더를 덮어쓰고 라인을 전량 교체한다.
     *
     * <p>{@code deliveryTag} 는 enum {@code name()} (미지정 시 null) 문자열로 보관한다
     * ({@link SlipSnapshot} 이 String 보관). 라인은 soft-deleted 행을 제외한다
     * — {@code @SQLRestriction} 으로 이미 DB 레벨에서 걸러지지만 명시적으로 한 번 더 가드한다.
     *
     * @return 현 전표의 헤더+라인 스냅샷 (라인 없으면 빈 리스트)
     */
    public SlipSnapshot toSnapshot() {
        List<SlipSnapshot.Line> snapshotLines = this.lines.stream()
                .filter(line -> !Boolean.TRUE.equals(line.getIsDeleted()))
                .map(line -> new SlipSnapshot.Line(
                        line.getProductId(),
                        line.getProductName(),
                        line.getModelName(),
                        line.getSpecification(),
                        line.getQuantity(),
                        line.getUnitPrice(),
                        line.getLineTotal(),
                        line.getNote(),
                        line.getUnitPriceWithVat(),
                        line.getVatAmount(),
                        line.getSupplyAmount(),
                        // R6-H3 — 세트 계보 캡처. head 만 true, 일반 라인은 null 로 생략(NON_NULL).
                        line.isSetHead() ? Boolean.TRUE : null,
                        line.getParentSetModel(),
                        // #937 재수렴 6차 A안 — 단가 권위 도메인 캡처. 버전이력/레드라인의 "단가"
                        // 표시는 스냅샷만 보고 판정하므로, 이 값이 실리지 않으면 화면(엔티티를
                        // 보는 쪽)과 감사 이력(스냅샷을 보는 쪽)이 서로 다른 단가를 말하게 된다.
                        line.getUnitPriceDomain() == null ? null : line.getUnitPriceDomain().name(),
                        // PR #991 — 주문이 선택한 categoryKey 축도 복사·복원 경로에서 보존한다.
                        line.getCategoryKey(),
                        line.getBundleSetOptions()))
                .toList();
        return new SlipSnapshot(
                this.slipNo,
                this.slipDate,
                this.partnerId,
                this.partnerName,
                this.partnerCode,
                this.businessNumber,
                this.memo,
                this.deliveryTag == null ? null : this.deliveryTag.name(),
                this.deliveryAddress,
                this.supervisionAddress,
                this.projectName,
                this.recipientPhone,
                this.paymentDueDate,
                this.destinationWarehouseId,
                this.destinationWarehouseName,
                // 기사/하차 3필드 (R8-BE-5) — editDriver 의 EDIT 스냅샷이 기사 변경을 담고
                // 복원이 당시 값으로 되돌리도록 캡처한다. restoreFromSnapshot 과 대칭.
                this.driverName,
                this.driverPhone,
                this.unloadDate,
                // audit overlay 필드 10개 (PR #318 cycle1 P1-1) — restoreFromSnapshot 과 대칭
                this.shippingAddress,
                this.inspectionAddress,
                this.receiverPhone,
                this.customerTel,
                this.customerAddress,
                this.customerRepresentative,
                this.paymentDueLabel,
                this.discountInfo,
                this.collectTerm,
                this.agreeTerm,
                snapshotLines);
    }

    /**
     * point-in-time 스냅샷으로 헤더+라인을 통째 복원한다 (권한 재편 Phase 2.1 Task 3).
     *
     * <p>{@link #toSnapshot()} 이 캡처한 동일 필드 집합을 역적용한다 — 헤더 필드를 스냅샷 값으로
     * 덮어쓰고 라인을 전량 교체한다. 라인 추가/삭제/수정이 모두 스냅샷 기준으로 정확히 반영되도록
     * 기존 라인을 {@code markDeleted} 후 컬렉션에서 제거하고, 스냅샷 라인을 {@link SlipLine#create}
     * 로 재생성해 새로 추가한다 ({@code orphanRemoval=false} 정책 일관).
     *
     * <p>{@code deliveryTag} 는 스냅샷의 enum name 문자열을 {@link DeliveryTag#valueOf(String)} 로
     * 역매핑한다 (null 안전). status / version / revisionCount 등 라이프사이클 메타는 복원 대상이
     * 아니며 — 복원도 신규 RESTORE revision 으로 별도 기록되므로 본 메서드는 헤더/라인 상태만 되돌린다.
     *
     * <p>라인 금액 semantics (#822 계열 sweep): 스냅샷 라인의 {@code unitPriceWithVat} 가 non-null
     * 이면 {@link SlipLine#restoreAuthoritativeAmounts} 로 캡처 시점의 lineTotal/supplyAmount/
     * vatAmount/unitPriceWithVat 권위값을 그대로 승계한다 — {@link SlipLine#create} 재계산만으로는
     * VAT 포함 입력 라인에서 반올림 드리프트가 생긴다. null(legacy) 라인은 종전 재계산 유지.
     *
     * <p>마감 lock 가드: {@link #requireNotLocked()} 를 가장 먼저 호출한다 — lock_flag=true 슬립은
     * 복원도 CONFLICT 로 거부한다 (마감 후 매출 정정 차단 정책과 일관). status 기반 마감 정책
     * (CONFIRMED/PROCESSING 등) 가드는 서비스 레이어 {@code guardLockPolicy} 가 책임진다.
     *
     * @param snapshot 복원 대상 시점의 full-snapshot (null 불가)
     * @throws BusinessException(CONFLICT) lock_flag = true 일 때
     */
    public void restoreFromSnapshot(SlipSnapshot snapshot) {
        requireNotLocked();
        if (snapshot == null) {
            throw new IllegalArgumentException("복원 스냅샷은 null 일 수 없습니다");
        }
        if (REQUIRED_PARTNER_STATUSES.contains(this.status) && snapshot.partnerId() == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "거래처 없는 이력으로 커밋 전표를 복원할 수 없습니다");
        }
        // 레거시 BUNDLE 정책은 mutation 전에 계산한다. signature가 확정되지 않는 정책으로
        // 바뀌더라도 헤더/기존 라인이 먼저 변경되지 않도록 복원 입력을 선행 검증한다.
        List<SlipSnapshot.Line> snapshotLines = snapshot.lines();
        List<com.samhanair.logis.slip.estimate.web.dto.BundleSetOptions> restoredSetOptions =
                snapshotLines == null
                        ? List.of()
                        : BundleSetInstanceKeyPolicy.materializeLegacyMultiInstanceKeys(snapshotLines,
                                SlipSnapshot.Line::parentSetModel,
                                line -> Boolean.TRUE.equals(line.setHead()),
                                snapLine -> snapLine.bundleSetOptions());
        // 헤더 필드 역적용 — toSnapshot() 이 캡처한 동일 필드 집합 (스냅샷 값 그대로 덮어씀)
        this.slipNo = snapshot.slipNo();
        this.slipDate = snapshot.slipDate();
        this.partnerId = snapshot.partnerId();
        this.partnerName = snapshot.partnerName();
        this.partnerCode = snapshot.partnerCode();
        this.businessNumber = snapshot.businessNumber();
        this.memo = snapshot.memo();
        this.deliveryTag = snapshot.deliveryTag() == null
                ? null
                : DeliveryTag.valueOf(snapshot.deliveryTag());
        this.deliveryAddress = snapshot.deliveryAddress();
        this.supervisionAddress = snapshot.supervisionAddress();
        this.projectName = snapshot.projectName();
        this.recipientPhone = snapshot.recipientPhone();
        this.paymentDueDate = snapshot.paymentDueDate();
        this.destinationWarehouseId = snapshot.destinationWarehouseId();
        this.destinationWarehouseName = snapshot.destinationWarehouseName();
        // 기사/하차 3필드 역적용 (R8-BE-5) — toSnapshot 과 대칭. 구 스냅샷(키 없음)은 null 이
        // 역적용되어 캡처 시점의 "기사 미지정" 상태를 그대로 재현한다 (헤더 필드 전반의 복원
        // 규약 = "스냅샷 값 그대로 덮어씀" 과 일관 — null-보존 규약은 편집 경로에만 적용된다).
        this.driverName = snapshot.driverName();
        this.driverPhone = snapshot.driverPhone();
        this.unloadDate = snapshot.unloadDate();
        // audit overlay 필드 10개 역적용 (PR #318 cycle1 P1-1) — toSnapshot 과 대칭.
        // applyOverlayPatch 가 수정하는 필드가 복원 시 정확히 당시 값으로 롤백되도록 직접 set.
        this.shippingAddress = snapshot.shippingAddress();
        this.inspectionAddress = snapshot.inspectionAddress();
        this.receiverPhone = snapshot.receiverPhone();
        this.customerTel = snapshot.customerTel();
        this.customerAddress = snapshot.customerAddress();
        this.customerRepresentative = snapshot.customerRepresentative();
        this.paymentDueLabel = snapshot.paymentDueLabel();
        this.discountInfo = snapshot.discountInfo();
        this.collectTerm = snapshot.collectTerm();
        this.agreeTerm = snapshot.agreeTerm();

        // 라인 전량 교체 — 기존 라인 markDeleted → clear → 스냅샷 라인 재생성 addAll
        // (replaceLines/replaceSalesLines 와 동일한 패턴이나, status DRAFT/SAVED 가드는 거치지 않는다
        //  — 복원은 서비스 레이어 guardLockPolicy 가 status 정책을 책임지므로 라인 상태만 되돌린다.)
        for (SlipLine line : new ArrayList<>(this.lines)) {
            line.markDeleted("system");
        }
        this.lines.clear();
        if (snapshotLines != null) {
            for (int index = 0; index < snapshotLines.size(); index++) {
                SlipSnapshot.Line snapLine = snapshotLines.get(index);
                SlipLine restored = SlipLine.create(this,
                        snapLine.productId(),
                        snapLine.productName(),
                        snapLine.modelName(),
                        snapLine.specification(),
                        snapLine.quantity(),
                        snapLine.unitPrice(),
                        snapLine.note(), null, snapLine.categoryKey());
                // R6-H3 — 스냅샷의 세트 계보 복원. 계보가 없으면(일반 라인/구 스냅샷 null) 평면
                // 재생성 시 이후 저장에서 구성품 배분가가 가격기억에 각인되는 오염이 재유입된다.
                if (snapLine.parentSetModel() != null && !snapLine.parentSetModel().isBlank()) {
                    restored.assignBundleComponent(
                            snapLine.parentSetModel(), Boolean.TRUE.equals(snapLine.setHead()),
                            restoredSetOptions.get(index));
                }
                // #822 계열 sweep — 스냅샷 캡처 금액 권위값 승계. create 는 공급단가에서
                // vat/withVat 를 재계산하므로 VAT 포함 입력 라인(11의 배수가 아닌 단가)에서
                // 캡처값 대비 반올림 드리프트가 생긴다. legacy(withVat null) 라인은 no-op.
                // #937 재수렴 6차 A안 — 캡처 시점 단가 도메인도 함께 승계한다. 구 스냅샷은
                // null 이므로 복원본도 legacy 로 남고(복원 전과 같은 표시), 알 수 없는 값을
                // 문자열 그대로 되살릴 수 없을 때도 null(=legacy)로 안전하게 떨어진다.
                restored.restoreAuthoritativeAmounts(snapLine.lineTotal(),
                        snapLine.supplyAmount(), snapLine.vatAmount(),
                        snapLine.unitPriceWithVat(),
                        parseUnitPriceDomain(snapLine.unitPriceDomain()));
                this.lines.add(restored);
            }
        }
    }

    /**
     * 스냅샷의 단가 도메인 문자열을 enum 으로 되살린다 — #937 재수렴 6차 A안.
     *
     * <p>알 수 없는 값(구 스냅샷의 null, 오타, 이후 제거된 상수)은 {@code null}(legacy) 로
     * 떨어뜨린다. 복원이 예외로 실패하는 것보다 "모른다"로 남아 현행 휴리스틱을 타는 편이
     * 안전하다 — 도메인 정보는 표시 판정용이지 금액 자체가 아니다.
     *
     * @param name 스냅샷에 담긴 enum name (null/공백/미상 허용)
     * @return 대응 enum, 알 수 없으면 null
     */
    private static com.samhanair.logis.slip.domain.UnitPriceDomain parseUnitPriceDomain(String name) {
        if (name == null || name.isBlank()) {
            return null;
        }
        try {
            return com.samhanair.logis.slip.domain.UnitPriceDomain.valueOf(name.trim());
        } catch (IllegalArgumentException unknown) {
            return null;
        }
    }
}
