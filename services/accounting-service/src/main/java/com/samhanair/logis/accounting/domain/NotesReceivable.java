package com.samhanair.logis.accounting.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 받을어음 도메인 엔티티.
 *
 * <p>거래처 UUID({@link #partnerId})는 내부 join 키로만 보관한다. 사용자 화면과 API 응답은
 * partnerCode/bizNo/partnerName 등 비즈니스 식별자로 변환한다.
 *
 * <p>상태 전이는 {@link #collect()}, {@link #settle()}, {@link #dishonor()} 도메인 메서드로만
 * 수행한다. 직접 setter 는 제공하지 않는다.
 */
@Entity
@Getter
@Table(name = "notes_receivable")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class NotesReceivable extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 거래처 내부 UUID. API 응답에는 노출하지 않는다. */
    @Column(name = "partner_id", nullable = false)
    private UUID partnerId;

    /** 어음번호. active row 기준 unique. */
    @Column(name = "note_no", nullable = false, length = 50)
    private String noteNo;

    @Column(name = "issue_date", nullable = false)
    private LocalDate issueDate;

    @Column(name = "maturity_date", nullable = false)
    private LocalDate maturityDate;

    @Column(name = "amount", nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(name = "note_type", nullable = false, length = 30)
    private NoteType noteType;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private NoteStatus status;

    @Column(name = "memo", columnDefinition = "TEXT")
    private String memo;

    private NotesReceivable(UUID partnerId, String noteNo, LocalDate issueDate, LocalDate maturityDate,
                            BigDecimal amount, NoteType noteType, String memo) {
        validateRequired(partnerId, noteNo, issueDate, maturityDate, amount);
        this.partnerId = partnerId;
        this.noteNo = noteNo.trim();
        this.issueDate = issueDate;
        this.maturityDate = maturityDate;
        this.amount = amount;
        this.noteType = noteType == null ? NoteType.PROMISSORY : noteType;
        this.status = NoteStatus.BOARDING;
        this.memo = blankToNull(memo);
    }

    /**
     * 받을어음을 등록한다.
     *
     * @param partnerId    거래처 내부 UUID
     * @param noteNo       어음번호
     * @param issueDate    발행일
     * @param maturityDate 만기일
     * @param amount       금액. 0보다 커야 한다.
     * @param noteType     어음 종류. null 이면 PROMISSORY
     * @param status       초기 상태. null 이면 BOARDING
     * @param memo         비고
     * @return 신규 받을어음
     */
    public static NotesReceivable register(UUID partnerId, String noteNo, LocalDate issueDate,
                                           LocalDate maturityDate, BigDecimal amount,
                                           NoteType noteType, String memo) {
        return new NotesReceivable(partnerId, noteNo, issueDate, maturityDate, amount, noteType, memo);
    }

    /** 보유 → 추심 상태로 전환한다. */
    public NotesReceivable collect() {
        requireStatus(NoteStatus.COLLECTING, NoteStatus.BOARDING);
        this.status = NoteStatus.COLLECTING;
        return this;
    }

    /** 결제완료 상태로 전환한다. */
    public NotesReceivable settle() {
        requireStatus(NoteStatus.SETTLED, NoteStatus.BOARDING, NoteStatus.COLLECTING);
        this.status = NoteStatus.SETTLED;
        return this;
    }

    /** 부도 상태로 전환한다. */
    public NotesReceivable dishonor() {
        requireStatus(NoteStatus.DISHONORED, NoteStatus.BOARDING, NoteStatus.COLLECTING);
        this.status = NoteStatus.DISHONORED;
        return this;
    }

    private void requireStatus(NoteStatus target, NoteStatus... allowed) {
        for (NoteStatus candidate : allowed) {
            if (this.status == candidate) {
                return;
            }
        }
        throw new BusinessException(ErrorCode.CONFLICT,
                "받을어음(" + noteNo + ") 현재 상태(" + status.getDisplayName() + ")에서는 "
                        + target.getDisplayName() + " 전환이 허용되지 않습니다.");
    }

    private static void validateRequired(UUID partnerId, String noteNo, LocalDate issueDate,
                                         LocalDate maturityDate, BigDecimal amount) {
        if (partnerId == null) {
            throw new IllegalArgumentException("partnerId 는 필수입니다");
        }
        if (noteNo == null || noteNo.isBlank()) {
            throw new IllegalArgumentException("noteNo 는 필수입니다");
        }
        if (issueDate == null) {
            throw new IllegalArgumentException("issueDate 는 필수입니다");
        }
        if (maturityDate == null) {
            throw new IllegalArgumentException("maturityDate 는 필수입니다");
        }
        if (maturityDate.isBefore(issueDate)) {
            throw new IllegalArgumentException("maturityDate 는 issueDate 이후여야 합니다");
        }
        if (amount == null || amount.signum() <= 0) {
            throw new IllegalArgumentException("amount 는 0보다 커야 합니다");
        }
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
