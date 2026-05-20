package com.samhanair.logis.accounting.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
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
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 분개장 헤더 (Plan §2 + §4 라이프사이클 표).
 *
 * <p>상태 머신:
 * <pre>
 *   DRAFT → POSTED → REVERSED
 * </pre>
 *
 * <p>라이프사이클 표 (Layer 4 의무):
 * <table>
 *   <caption>Journal 라이프사이클</caption>
 *   <tr><th>메서드</th><th>from → to</th><th>부수효과</th></tr>
 *   <tr><td>{@link #post(String)}</td><td>DRAFT → POSTED</td>
 *     <td>차/대 합계 일치 검증, postedAt/By 기입</td></tr>
 *   <tr><td>{@link #markReversed()}</td><td>POSTED → REVERSED</td>
 *     <td>역분개 Journal 신규 생성은 호출자 책임 (service 가 차/대 swap 한 신규 entity 생성)</td></tr>
 *   <tr><td>{@link #addLine}/{@link #removeLine}</td><td>(DRAFT only)</td>
 *     <td>POSTED 이후 mutation 차단 (CONFLICT)</td></tr>
 * </table>
 *
 * <p>POSTED 이후 직접 수정 불가 (Q7 — audit safe). 정정은 reverse 후 신규 분개 추가.
 *
 * <p>낙관적 락: {@link Version} 으로 동시 mutation 충돌 감지.
 */
@Entity
@Getter
@Table(name = "journals")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class Journal extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /**
     * 분개번호 — {@code yyyyMMdd-N} ({@link com.samhanair.logis.accounting.service.JournalNumberService}).
     * partial UNIQUE INDEX 로 active 분개 안에서 유일성 보장.
     */
    @Column(name = "journal_no", nullable = false, length = 40)
    private String journalNo;

    /** 분개 일자 (귀속 회계 일자). */
    @Column(name = "journal_date", nullable = false)
    private LocalDate journalDate;

    /** 분개 적요 (≤500자). */
    @Column(name = "description", length = 500)
    private String description;

    /** 분개 출처 — SLIP / MANUAL / CLOSING. */
    @Enumerated(EnumType.STRING)
    @Column(name = "source_type", nullable = false, length = 20)
    private JournalSourceType sourceType;

    /**
     * 출처 참조 ID — SLIP 면 slip UUID, CLOSING 이면 결산 ID 등. MANUAL 이면 null.
     * Slice A 본 슬라이스는 MANUAL 만 사용 → 본 필드는 향후 슬라이스용.
     */
    @Column(name = "source_ref_id")
    private UUID sourceRefId;

    /** 출처 business key — MIG-9 Cash external_ref 등 문자열 기반 멱등 키. */
    @Column(name = "source_ref", length = 100)
    private String sourceRef;

    /** 분개 상태 (DRAFT/POSTED/REVERSED). */
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private JournalStatus status;

    /** 게시 시각 — POSTED 트랜지션 시 기록. */
    @Column(name = "posted_at")
    private LocalDateTime postedAt;

    /** 게시자 user-id — POSTED 트랜지션 시 기록. */
    @Column(name = "posted_by", length = 50)
    private String postedBy;

    /**
     * 역분개 참조 — REVERSED 마킹된 분개가 가리키는 신규 역분개 Journal UUID.
     * 신규 역분개 entity 도 동일 필드를 사용해 원분개를 참조 (양방향 추적).
     */
    @Column(name = "reversed_journal_id")
    private UUID reversedJournalId;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    @OneToMany(mappedBy = "journal", cascade = CascadeType.ALL, orphanRemoval = true,
            fetch = FetchType.LAZY)
    private List<JournalLine> lines = new ArrayList<>();

    private Journal(String journalNo, LocalDate journalDate, String description,
                    JournalSourceType sourceType, UUID sourceRefId) {
        this.journalNo = journalNo;
        this.journalDate = journalDate;
        this.description = description;
        this.sourceType = sourceType;
        this.sourceRefId = sourceRefId;
        this.status = JournalStatus.DRAFT;
        this.version = 0L;
    }

    private Journal(String journalNo, LocalDate journalDate, String description,
                    JournalSourceType sourceType, String sourceRef) {
        this(journalNo, journalDate, description, sourceType, (UUID) null);
        this.sourceRef = sourceRef;
    }

    /**
     * 신규 분개 생성 (DRAFT). 라인은 별도 {@link #addLine} 으로 추가.
     *
     * @param journalNo 채번된 분개번호 ({@code yyyyMMdd-N})
     * @param journalDate 분개 일자
     * @param description 적요 (선택, ≤500자)
     * @param sourceType 출처 (MANUAL/SLIP/CLOSING)
     * @param sourceRefId 출처 참조 ID (MANUAL 이면 null)
     * @return DRAFT 신규 Journal
     * @throws IllegalArgumentException 인자 검증 실패
     */
    public static Journal create(String journalNo, LocalDate journalDate, String description,
                                 JournalSourceType sourceType, UUID sourceRefId) {
        if (journalNo == null || journalNo.isBlank() || journalNo.length() > 40) {
            throw new IllegalArgumentException("journalNo 는 1~40자 필수입니다");
        }
        if (journalDate == null) {
            throw new IllegalArgumentException("journalDate 는 필수입니다");
        }
        if (sourceType == null) {
            throw new IllegalArgumentException("sourceType 은 필수입니다");
        }
        if (description != null && description.length() > 500) {
            throw new IllegalArgumentException("description 은 최대 500자입니다");
        }
        return new Journal(journalNo, journalDate, description, sourceType, sourceRefId);
    }

    /**
     * 문자열 sourceRef 기반 신규 분개 생성. MIG-9 Cash external_ref 처럼 UUID 가 아닌 business key
     * 멱등 키를 사용하는 자동 생성 경로에서 사용한다.
     *
     * <p>MIG-9 구현은 대량 insert/row-level reject 처리를 위해 raw SQL INSERT 패턴을 사용한다.
     * 본 오버로드는 MIG-10+ 자동 분개 도메인 factory 정리 시 활용 후보로 유지한다.
     */
    public static Journal create(String journalNo, LocalDate journalDate, String description,
                                 JournalSourceType sourceType, String sourceRef) {
        if (journalNo == null || journalNo.isBlank() || journalNo.length() > 40) {
            throw new IllegalArgumentException("journalNo 는 1~40자 필수입니다");
        }
        if (journalDate == null) {
            throw new IllegalArgumentException("journalDate 는 필수입니다");
        }
        if (sourceType == null) {
            throw new IllegalArgumentException("sourceType 은 필수입니다");
        }
        if (sourceRef != null && sourceRef.length() > 100) {
            throw new IllegalArgumentException("sourceRef 는 최대 100자입니다");
        }
        if (description != null && description.length() > 500) {
            throw new IllegalArgumentException("description 은 최대 500자입니다");
        }
        return new Journal(journalNo, journalDate, description, sourceType, sourceRef);
    }

    /**
     * 라인 1건 추가 — DRAFT 단계만. 양방향 일관성: caller 가 {@link JournalLine#create} 시
     * journal 인자로 본 인스턴스를 넘긴 후 본 메서드 호출.
     *
     * @param line 추가할 라인
     * @throws BusinessException(CONFLICT) 현재 상태가 DRAFT 가 아닐 때
     */
    public void addLine(JournalLine line) {
        if (this.status != JournalStatus.DRAFT) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "라인 추가는 DRAFT 단계에서만 허용됩니다 (현재: " + this.status + ")");
        }
        this.lines.add(line);
    }

    /**
     * 라인 1건 제거 (orphan removal) — DRAFT 단계만.
     *
     * @param lineId 제거할 라인 UUID
     * @return 제거 성공 여부
     * @throws BusinessException(CONFLICT) 현재 상태가 DRAFT 가 아닐 때
     */
    public boolean removeLine(UUID lineId) {
        if (this.status != JournalStatus.DRAFT) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "라인 제거는 DRAFT 단계에서만 허용됩니다 (현재: " + this.status + ")");
        }
        return this.lines.removeIf(l -> l.getId() != null && l.getId().equals(lineId));
    }

    /**
     * 게시 (DRAFT → POSTED). 라인 차/대 합계 일치 강제 검증.
     *
     * <p>부수효과:
     * <ol>
     *   <li>차변 합계 = 대변 합계 검증 (mismatch 면 {@link BusinessException}({@link ErrorCode#CONFLICT}))</li>
     *   <li>라인 1개 이상 검증 (없으면 CONFLICT)</li>
     *   <li>{@code postedAt = now()}, {@code postedBy = actorUserId}</li>
     *   <li>{@code status = POSTED}</li>
     * </ol>
     *
     * @param actorUserId 게시자 user-id (필수)
     * @throws BusinessException(CONFLICT) DRAFT 가 아니거나, 라인 0건이거나, 차/대 합계 mismatch
     */
    public void post(String actorUserId) {
        if (this.status != JournalStatus.DRAFT) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "게시는 DRAFT 단계에서만 허용됩니다 (현재: " + this.status + ")");
        }
        if (actorUserId == null || actorUserId.isBlank()) {
            throw new IllegalArgumentException("actorUserId 는 필수입니다");
        }
        if (this.lines.isEmpty()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "라인이 1개 이상 있어야 게시할 수 있습니다");
        }
        BigDecimal debitSum = totalDebit();
        BigDecimal creditSum = totalCredit();
        if (debitSum.compareTo(creditSum) != 0) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "차변 합계(" + debitSum + ") 와 대변 합계(" + creditSum + ") 가 일치하지 않습니다");
        }
        this.status = JournalStatus.POSTED;
        this.postedAt = LocalDateTime.now();
        this.postedBy = actorUserId;
    }

    /**
     * 역분개 마킹 (POSTED → REVERSED). 신규 역분개 Journal 생성은 호출자(service) 책임.
     * service 는 본 메서드 호출 전/후로 차/대 swap 한 신규 Journal 을 만들어 POST 한 뒤 그 ID 를
     * {@link #linkReversal(UUID)} 로 연결한다.
     *
     * @throws BusinessException(CONFLICT) POSTED 가 아닐 때
     */
    public void markReversed() {
        if (this.status != JournalStatus.POSTED) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "역분개는 POSTED 단계에서만 허용됩니다 (현재: " + this.status + ")");
        }
        this.status = JournalStatus.REVERSED;
    }

    /**
     * 역분개 Journal 참조 연결 — service 가 신규 역분개를 저장한 직후 호출.
     *
     * @param reversalJournalId 신규 역분개 Journal UUID
     */
    public void linkReversal(UUID reversalJournalId) {
        this.reversedJournalId = reversalJournalId;
    }

    /** 차변 합계 — 라인 debitAmount 합. */
    public BigDecimal totalDebit() {
        return this.lines.stream()
                .map(JournalLine::getDebitAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /** 대변 합계 — 라인 creditAmount 합. */
    public BigDecimal totalCredit() {
        return this.lines.stream()
                .map(JournalLine::getCreditAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }
}
