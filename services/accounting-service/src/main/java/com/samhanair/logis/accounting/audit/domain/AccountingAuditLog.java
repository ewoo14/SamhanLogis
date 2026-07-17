package com.samhanair.logis.accounting.audit.domain;

import com.samhanair.logis.shared.realtime.audit.AuditLogEntry;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 회계 도메인 audit overlay — PR-H4b (Phase 12 Step 4b).
 *
 * <p>shared:realtime-abstraction 의 {@link AuditLogEntry} @MappedSuperclass 상속 — entity 9 필드
 * + BaseEntity 7 audit 필드 자동 보유. accounting-service 의 모든 도메인
 * (TaxInvoice / Journal / AccountingPeriod) mutation 시 1행 INSERT.
 *
 * <p><b>entity_id 의미</b> — 대상 entity UUID. service layer 가 entity_kind 별도 인지하지 않고
 * field_name prefix ("taxInvoice.partnerName" / "journal.description" 등) 로 도메인 식별.
 *
 * <p><b>UUID 비공개 가드</b> ({@code feedback_uuid_no_user_visibility}): 사용자 화면 노출 식별자
 * = actorName 만. actorId 는 audit/감사 추적용.
 *
 * <p><b>Soft-delete + FK 미강제</b>: 한국 일반기업회계기준 + 세법 audit 의무 — 도메인 entity
 * soft-delete 후에도 audit row 영구 보존.
 */
@Entity
@Getter
@Table(name = "accounting_audit_logs")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class AccountingAuditLog extends AuditLogEntry {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /**
     * 신규 audit log 정적 factory — shared {@link AuditLogEntry#init} 위임.
     *
     * @param entityId 대상 entity (TaxInvoice / Journal / AccountingPeriod) UUID (필수)
     * @param revisionNo 단조 증가 수정 번호 (1 이상)
     * @param actorId 수정자 UUID
     * @param actorName 수정자 표시명 (UUID 비공개 가드)
     * @param actorColor FE 색상 hex (선택)
     * @param fieldName 변경된 필드 식별자 (≤50자, 권장 prefix: "taxInvoice." / "journal." / "period.")
     * @param oldValue 이전 값 (선택, null 가능)
     * @param newValue 새 값 (선택, null 가능 — old/new 둘 다 null 은 거부)
     * @return 영속화 전 신규 AccountingAuditLog
     */
    public static AccountingAuditLog record(UUID entityId, int revisionNo, UUID actorId,
                                            String actorName, String actorColor, String fieldName,
                                            String oldValue, String newValue) {
        return record(entityId, revisionNo, actorId, actorName, actorColor, fieldName,
                oldValue, newValue, LocalDateTime.now());
    }

    /**
     * 변경 시각을 호출자가 주입하는 정적 factory — #810 R3-CODEX (S4-M2).
     *
     * <p>한 작업(batch)의 여러 필드 행이 각기 {@code LocalDateTime.now()} 를 호출하면 같은
     * 작업인데도 행마다 시각이 갈라져 회차 그룹핑/정렬이 부정확해진다. batch 는 작업당
     * 단일 timestamp 를 계산해 전 행에 동일 주입한다.
     *
     * @param changedAt 작업 단위 변경 시각 (null 이면 {@link AuditLogEntry#init} 이 now 로 대체)
     */
    public static AccountingAuditLog record(UUID entityId, int revisionNo, UUID actorId,
                                            String actorName, String actorColor, String fieldName,
                                            String oldValue, String newValue, LocalDateTime changedAt) {
        AccountingAuditLog log = new AccountingAuditLog();
        log.init(entityId, revisionNo, actorId, actorName, actorColor, fieldName,
                oldValue, newValue, changedAt);
        return log;
    }
}
