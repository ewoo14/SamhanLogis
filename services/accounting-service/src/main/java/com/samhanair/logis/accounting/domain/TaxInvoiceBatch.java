package com.samhanair.logis.accounting.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 세금계산서 일괄발행 배치 — GAS 계산서일괄등록양식 생성 기능 이식.
 *
 * <p>판매조회 기간 데이터를 홈택스 일괄 업로드 양식 (.xlsx 59컬럼) 으로 변환한 작업 단위.
 * Notion 저장 대신 RDB (accounting_db) 에 저장한다.
 *
 * <p>100건 단위 분할 결과는 {@link #splitFileCount} 에 기록되며, dataSnapshotJson 에
 * gzip+base64 압축된 JSON 을 저장한다 (GAS compressString 로직 동등 구현).
 *
 * <p>상태 머신:
 * <pre>
 *   DRAFT → COMPLETED → DOWNLOADED
 * </pre>
 *
 * <p>BaseEntity 7 audit + Soft Delete ({@link BaseEntity#markDeleted()}).
 */
@Entity
@Getter
@Table(name = "tax_invoice_batches")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class TaxInvoiceBatch extends BaseEntity {

    /** PK — UUID v4 자동 생성. */
    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /**
     * 일괄발행 배치 번호 — 자동 채번 (형식: {@code TIB-yyyyMM-NNN}).
     * 사용자 노출 식별자 (UUID 비공개 원칙 준수).
     */
    @Column(name = "batch_no", nullable = false, length = 20)
    private String batchNo;

    /** 판매조회 조회 시작일 (inclusive). */
    @Column(name = "source_from_date", nullable = false)
    private LocalDate sourceFromDate;

    /** 판매조회 조회 종료일 (inclusive). */
    @Column(name = "source_to_date", nullable = false)
    private LocalDate sourceToDate;

    /** 변환된 홈택스 양식 행 수 (제외 거래처 적용 후). */
    @Column(name = "total_row_count", nullable = false)
    private int totalRowCount;

    /** 100건 단위 분할 파일 수. splitFileCount = ceil(totalRowCount / 100). */
    @Column(name = "split_file_count", nullable = false)
    private int splitFileCount;

    /**
     * 제외 전표번호 목록 — CSV 문자열 (예: {@code "SLP-001,SLP-002"}).
     * nullable — 제외 목록 없을 시 null.
     */
    @Column(name = "excluded_slip_nos", columnDefinition = "TEXT")
    private String excludedSlipNos;

    /**
     * 제외 거래처 코드 목록 — CSV 문자열 (예: {@code "PC001,PC002"}).
     * nullable — 제외 목록 없을 시 null.
     */
    @Column(name = "excluded_partner_codes", columnDefinition = "TEXT")
    private String excludedPartnerCodes;

    /**
     * 변환 결과 JSON — gzip+base64 압축 (GAS compressString 동등).
     * 복원 시 decompress 후 JSON 파싱.
     * nullable — DRAFT 상태에서는 아직 저장 전일 수 있음.
     */
    @Column(name = "data_snapshot_json", columnDefinition = "TEXT")
    private String dataSnapshotJson;

    /** 스냅샷 문서 유형 — 기존 홈택스 행은 HOMETAX, 확장 문서는 명시적으로 구분한다. */
    @Column(name = "document_type", nullable = false, length = 30)
    private String documentType = "HOMETAX";

    /** 문서의 사용자 노출 업무 식별자 (예: 거래처 코드). */
    @Column(name = "document_key", length = 100)
    private String documentKey;

    /** 복원본 복사 저장 시 원본 사용자 배치번호. 최초 live 저장은 null. */
    @Column(name = "source_batch_no", length = 20)
    private String sourceBatchNo;

    /** 작업자 UUID (X-User-Id 헤더). */
    @Column(name = "processed_by")
    private UUID processedBy;

    /** 작업 완료 시각. */
    @Column(name = "processed_at")
    private LocalDateTime processedAt;

    /** 배치 상태 (DRAFT/COMPLETED/DOWNLOADED). */
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private TaxInvoiceBatchStatus status;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    /**
     * 신규 배치 생성 (DRAFT).
     *
     * @param batchNo      채번된 배치 번호
     * @param fromDate     판매조회 시작일
     * @param toDate       판매조회 종료일
     * @param processedBy  작업자 UUID
     * @return DRAFT 상태의 {@link TaxInvoiceBatch}
     */
    public static TaxInvoiceBatch create(String batchNo, LocalDate fromDate, LocalDate toDate,
                                         UUID processedBy) {
        if (batchNo == null || batchNo.isBlank()) {
            throw new IllegalArgumentException("batchNo 는 필수입니다");
        }
        if (fromDate == null || toDate == null) {
            throw new IllegalArgumentException("fromDate/toDate 는 필수입니다");
        }
        if (toDate.isBefore(fromDate)) {
            throw new IllegalArgumentException("toDate 는 fromDate 이후여야 합니다");
        }
        TaxInvoiceBatch batch = new TaxInvoiceBatch();
        batch.batchNo = batchNo;
        batch.sourceFromDate = fromDate;
        batch.sourceToDate = toDate;
        batch.processedBy = processedBy;
        batch.processedAt = LocalDateTime.now();
        batch.totalRowCount = 0;
        batch.splitFileCount = 0;
        batch.status = TaxInvoiceBatchStatus.DRAFT;
        batch.version = 0L;
        return batch;
    }

    /** 기존 RDB 스냅샷 계약을 다른 문서 생성 결과에 적용한다. */
    public static TaxInvoiceBatch createDocumentSnapshot(String documentType, String documentKey,
                                                         String batchNo, LocalDate fromDate,
                                                         LocalDate toDate, UUID processedBy) {
        return createDocumentSnapshot(documentType, documentKey, batchNo, fromDate, toDate,
                processedBy, null);
    }

    /** 원장 복원본을 새 snapshot으로 복사할 때 원본 배치번호를 lineage로 남긴다. */
    public static TaxInvoiceBatch createDocumentSnapshot(String documentType, String documentKey,
                                                         String batchNo, LocalDate fromDate,
                                                         LocalDate toDate, UUID processedBy,
                                                         String sourceBatchNo) {
        TaxInvoiceBatch batch = create(batchNo, fromDate, toDate, processedBy);
        if (documentType == null || documentType.isBlank()) {
            throw new IllegalArgumentException("documentType 은 필수입니다");
        }
        batch.documentType = documentType;
        batch.documentKey = documentKey;
        batch.sourceBatchNo = sourceBatchNo;
        return batch;
    }

    /**
     * 변환 결과 저장 완료 (DRAFT → COMPLETED).
     *
     * @param totalRowCount     변환 행 수
     * @param splitFileCount    분할 파일 수
     * @param excludedSlipNos   제외 전표번호 CSV (nullable)
     * @param excludedPartnerCodes 제외 거래처코드 CSV (nullable)
     * @param dataSnapshotJson  gzip+base64 압축 JSON
     */
    public void complete(int totalRowCount, int splitFileCount,
                         String excludedSlipNos, String excludedPartnerCodes,
                         String dataSnapshotJson) {
        this.totalRowCount = totalRowCount;
        this.splitFileCount = splitFileCount;
        this.excludedSlipNos = excludedSlipNos;
        this.excludedPartnerCodes = excludedPartnerCodes;
        this.dataSnapshotJson = dataSnapshotJson;
        this.status = TaxInvoiceBatchStatus.COMPLETED;
    }

    /**
     * 다운로드 완료 마킹 (COMPLETED → DOWNLOADED).
     * 이미 DOWNLOADED 이면 멱등 처리 (재다운로드 허용).
     */
    public void markDownloaded() {
        this.status = TaxInvoiceBatchStatus.DOWNLOADED;
    }
}
