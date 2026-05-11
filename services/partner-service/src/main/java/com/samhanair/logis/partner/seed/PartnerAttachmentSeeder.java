package com.samhanair.logis.partner.seed;

import com.samhanair.logis.partner.domain.AttachmentType;
import com.samhanair.logis.partner.domain.Partner;
import com.samhanair.logis.partner.domain.PartnerAttachment;
import com.samhanair.logis.partner.repository.PartnerAttachmentRepository;
import com.samhanair.logis.partner.repository.PartnerRepository;
import jakarta.annotation.PostConstruct;
import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Stage 1 보강 — 거래처 첨부 파일 placeholder seed.
 *
 * <p>{@link PartnerSeeder} 가 50개 partner 를 INSERT 한 직후 실행 (순서 보장: {@code @Order(20)}).
 * 본 seeder 는 그 중 30 partner (seq 1~30) 에 placeholder 첨부 metadata 만 INSERT 한다 — 실 파일은
 * MinIO 에 업로드하지 않고 storageUrl 은 dummy URL.
 *
 * <p>분포 (총 75 첨부):
 * <ul>
 *   <li>BIZ_LICENSE — 30 partner × 1건 = 30건 (사업자등록증 사본)</li>
 *   <li>BUSINESS_CARD — 30 partner × 1건 = 30건 (담당자 명함)</li>
 *   <li>TAX_INVOICE — 10 partner × 1건 = 10건 (seq 1~10)</li>
 *   <li>CONTRACT — 5 partner × 1건 = 5건 (seq 1~5)</li>
 * </ul>
 *
 * <p><b>이중 가드</b>: {@code @Profile("dev")} + {@code app.partner.seed-test-attachments=true} 둘 다
 * 만족 시만 실행. 운영 / staging 환경 데이터 오염 방지.
 *
 * <p><b>Idempotency</b>: 결정성 UUID storageKey 사용 ({@code samhan-seed:partner-attachment:...}) →
 * {@link PartnerAttachmentRepository#existsByStorageKey(String)} 으로 중복 skip. 부분 시드 후 재실행 시
 * 누락 분만 생성.
 */
@Component
@Profile("dev")
@ConditionalOnProperty(value = "app.partner.seed-test-attachments", havingValue = "true")
@Order(20) // PartnerSeeder 기본 우선순위 이후
public class PartnerAttachmentSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(PartnerAttachmentSeeder.class);

    /** 분포 정의 — (attachmentType, 적용 partner seq 최대값). */
    private static final List<TypeDistribution> DISTRIBUTIONS = List.of(
            new TypeDistribution(AttachmentType.BIZ_LICENSE, 30),
            new TypeDistribution(AttachmentType.BUSINESS_CARD, 30),
            new TypeDistribution(AttachmentType.TAX_INVOICE, 10),
            new TypeDistribution(AttachmentType.CONTRACT, 5)
    );

    private final PartnerRepository partnerRepository;
    private final PartnerAttachmentRepository attachmentRepository;

    public PartnerAttachmentSeeder(PartnerRepository partnerRepository,
                                   PartnerAttachmentRepository attachmentRepository) {
        this.partnerRepository = partnerRepository;
        this.attachmentRepository = attachmentRepository;
    }

    @PostConstruct
    void announce() {
        log.info("PartnerAttachmentSeeder 활성 (Profile=dev + app.partner.seed-test-attachments=true)");
    }

    @Override
    @Transactional
    public void run(String... args) {
        int created = 0;
        int skipped = 0;
        for (TypeDistribution dist : DISTRIBUTIONS) {
            for (int seq = 1; seq <= dist.maxSeq(); seq++) {
                String partnerCode = String.format("P-2026-%04d", seq);
                Partner partner = partnerRepository.findByPartnerCode(partnerCode).orElse(null);
                if (partner == null) {
                    log.debug("Skip seed (partner missing): {}", partnerCode);
                    continue;
                }
                String storageKey = buildSeedStorageKey(partnerCode, dist.type(), 1);
                if (attachmentRepository.existsByStorageKey(storageKey)) {
                    skipped++;
                    continue;
                }
                try {
                    PartnerAttachment a = buildSeedAttachment(partner, dist.type(), partnerCode, storageKey, 1);
                    attachmentRepository.save(a);
                    created++;
                } catch (RuntimeException ex) {
                    log.error("Failed to seed attachment {} ({}): {}",
                            partnerCode, dist.type(), ex.getMessage(), ex);
                }
            }
        }
        log.info("PartnerAttachmentSeeder created {} attachments (skipped {})", created, skipped);
    }

    /** 결정성 UUID + dummy URL 로 placeholder 첨부 row 생성. */
    private PartnerAttachment buildSeedAttachment(Partner partner, AttachmentType type,
                                                  String partnerCode, String storageKey, int seq) {
        UUID uploaderId = UUID.nameUUIDFromBytes(("samhan-seed:partner-attachment-uploader:" + partnerCode).getBytes());
        String fileName = buildFileName(partner.getName(), type, seq);
        String mimeType = (type == AttachmentType.CONTRACT) ? "application/pdf" : "image/png";
        long fileSize = pseudoFileSize(partnerCode, type);
        String description = buildDescription(type);

        PartnerAttachment a = PartnerAttachment.register(
                partner.getId(),
                type,
                fileName,
                fileSize,
                mimeType,
                storageKey,
                uploaderId,
                description);
        a.refreshStorageUrl(buildDummyUrl(storageKey));
        // 결정성 id (재실행 시 동일 row 재사용 가능 — UUID 비공개 가드 일관)
        applyDeterministicId(a, partnerCode, type, seq);
        return a;
    }

    /** 결정성 UUID storage key — 같은 (partnerCode, type, seq) 조합은 항상 같은 key. */
    private static String buildSeedStorageKey(String partnerCode, AttachmentType type, int seq) {
        UUID deterministic = UUID.nameUUIDFromBytes(
                ("samhan-seed:partner-attachment:" + partnerCode + ":" + type + ":" + seq).getBytes());
        String ext = (type == AttachmentType.CONTRACT) ? ".pdf" : ".png";
        return "partner-attachments/seed/" + partnerCode + "/" + deterministic + ext;
    }

    private static String buildFileName(String partnerName, AttachmentType type, int seq) {
        String suffix = switch (type) {
            case BIZ_LICENSE -> "사업자등록증";
            case BUSINESS_CARD -> "담당자명함";
            case TAX_INVOICE -> "세금계산서";
            case CONTRACT -> "공급계약서";
            case VISIT_PHOTO -> "방문사진";
            case OTHER -> "기타문서";
        };
        String ext = (type == AttachmentType.CONTRACT) ? ".pdf" : ".png";
        return partnerName + "_" + suffix + "_" + seq + ext;
    }

    private static String buildDescription(AttachmentType type) {
        return switch (type) {
            case BIZ_LICENSE -> "[seed] 사업자등록증 사본 placeholder";
            case BUSINESS_CARD -> "[seed] 담당자 명함 placeholder";
            case TAX_INVOICE -> "[seed] 세금계산서 placeholder";
            case CONTRACT -> "[seed] 공급계약서 placeholder";
            case VISIT_PHOTO -> "[seed] 영업 방문 사진 placeholder";
            case OTHER -> "[seed] 기타 문서 placeholder";
        };
    }

    private static long pseudoFileSize(String partnerCode, AttachmentType type) {
        // 50KB ~ 500KB 결정성 분포
        int hash = Math.abs((partnerCode + type).hashCode());
        return 50_000L + (hash % 450_000L);
    }

    private static String buildDummyUrl(String storageKey) {
        return "http://localhost:9000/partner-attachments/" + storageKey + "?seed=true";
    }

    /**
     * 결정성 UUID 를 reflection 으로 강제 주입 — seeder 재실행 시 동일 row 재사용.
     * production 코드 path 가 아니므로 reflection 허용 (테스트 fixture 동등).
     */
    private static void applyDeterministicId(PartnerAttachment a, String partnerCode,
                                             AttachmentType type, int seq) {
        UUID deterministic = UUID.nameUUIDFromBytes(
                ("samhan-seed:partner-attachment-id:" + partnerCode + ":" + type + ":" + seq).getBytes());
        try {
            Field idField = PartnerAttachment.class.getDeclaredField("id");
            idField.setAccessible(true);
            idField.set(a, deterministic);
        } catch (ReflectiveOperationException ex) {
            // 결정성 id 적용 실패 시에도 row 자체는 정상 INSERT (UuidGenerator fallback)
            log.warn("결정성 id 주입 실패 — fallback to UuidGenerator: {}", ex.getMessage());
        }
    }

    private record TypeDistribution(AttachmentType type, int maxSeq) { }

    /** unused — 미래 확장 (per-partner 다중 첨부) 시 사용. */
    @SuppressWarnings("unused")
    private static List<Integer> sequencesFor(int maxSeq, int countPerPartner) {
        List<Integer> out = new ArrayList<>(maxSeq * countPerPartner);
        for (int i = 1; i <= maxSeq; i++) {
            for (int j = 1; j <= countPerPartner; j++) {
                out.add(i * 10 + j);
            }
        }
        return out;
    }
}
