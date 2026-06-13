package com.samhanair.logis.groupware.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.LocalDate;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 결재문서번호 채번 시퀀스 — KST 일자별 last_seq 보조.
 *
 * <p>공개번호는 전표번호 표준과 같은 {@code yyyy/MM/dd-N} 형식이다. 결정적 seed UUID 에서 번호를
 * 파생하지 않고, 날짜별 row 잠금으로 동시 채번을 직렬화한다.
 */
@Entity
@Getter
@Table(name = "approval_number_sequences")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class ApprovalNumberSequence extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "approval_date", nullable = false)
    private LocalDate approvalDate;

    @Column(name = "last_seq", nullable = false)
    private int lastSeq;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    private ApprovalNumberSequence(LocalDate approvalDate) {
        this.approvalDate = approvalDate;
        this.lastSeq = 0;
        this.version = 0L;
    }

    /** 신규 시퀀스 생성 — 해당 날짜 첫 발급 시 호출. */
    public static ApprovalNumberSequence create(LocalDate approvalDate) {
        return new ApprovalNumberSequence(approvalDate);
    }

    /** 다음 순번 반환 + lastSeq 증가. */
    public int next() {
        this.lastSeq += 1;
        return this.lastSeq;
    }
}
