package com.samhanair.logis.slip.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.price.domain.PartnerProductPriceMemory;
import com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryCommand;
import com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryService;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.revision.domain.SlipRevisionType;
import com.samhanair.logis.slip.revision.service.SlipRevisionService;
import com.samhanair.logis.slip.service.cutoff.OutboundCutoffGuard;
import com.samhanair.logis.slip.service.closing.SlipClosedDateGuard;
import com.samhanair.logis.slip.web.dto.SlipDetailResponse;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 전표 서버측 복사 서비스 (R6-H2).
 *
 * <p>종전 FE {@code duplicateSlip} 은 상세 응답의 전개된 세트 구성품을 평면 라인으로
 * {@code POST /slips} 재전송했다. 서버는 구성품 productId 를 단품으로 판정해 세트 계보가
 * 소실되고, 구성품 배분가가 {@code LINE_SAVE} 가격기억에 각인됐다 — 복사 1클릭마다 오염 재생산.
 * 클라이언트 재전송 데이터는 신뢰할 수 없으므로(R5 (b)안 배제 논리와 일관) 서버가 원본 영속
 * 라인에서 직접 복사한다:
 * <ul>
 *   <li>라인 값(금액 권위값 포함)과 세트 계보({@code setHead}/{@code parentSetModel})를
 *       {@link SlipLine#copyOf} 로 그대로 승계 — 복사본도 세트 표시 유지.</li>
 *   <li>가격기억은 <b>비구성품 라인만</b> {@code LINE_SAVE} 수집(구성품 배분가 각인 금지,
 *       spec §24). 세트 자체 단가는 복사 시 사용자 입력이 없으므로 {@code BUNDLE_SET} 을
 *       기록하지 않는다.</li>
 *   <li>헤더는 FE 복사 계약과 동일 범위만 승계(창고/거래처/배송태그/메모/기사) — 전표번호·일자·
 *       상태(DRAFT)·배송일정·이카운트 필드는 신규 생성 규칙으로 재산출. businessNumber /
 *       partnerCode 는 partnerId 로 재-resolve (stale snapshot 복사 방지).</li>
 *   <li>{@code sourceOrderLineId} 미승계 — 주문 부분전환 역참조 중복 방지.</li>
 *   <li>원본 라인 productId 재검증은 생략한다 — 서버가 이미 검증·영속한 데이터의 사본이며,
 *       마스터가 이후 soft-delete 됐어도 전표 라인은 snapshot 이라 유효(D-R3-3 정책과 일관).</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class SlipDuplicateService {

    private final SlipRepository slipRepository;
    private final SlipNumberService slipNumberService;
    private final PartnerInternalClient partnerInternalClient;
    private final SlipRevisionService slipRevisionService;
    /** #809 — 거래처+품목 최근 VAT 포함 입력단가 기억. 실패해도 복사는 계속된다. */
    private final PartnerProductPriceMemoryService priceMemoryService;
    /** 출고전표 복사도 신규 생성과 동일하게 당일 마감 게이트를 적용한다. */
    private final OutboundCutoffGuard cutoffGuard;
    private final SlipClosedDateGuard closedDateGuard;
    /** KST 기준 오늘 — 복사본 전표일자/컷오프 게이트와 동일 Clock. */
    private final Clock clock;

    /**
     * 원본 전표를 서버측에서 복사해 신규 DRAFT 전표를 생성한다.
     *
     * <p>복사본 전표일자는 오늘(KST)이며 전표번호는 신규 채번한다. OUTBOUND 는 원본 배송태그
     * 기준으로 당일 마감 게이트를 통과해야 한다 (신규 생성과 동일 정책).
     *
     * @param sourceSlipId 원본 전표 UUID
     * @param requesterId 요청자 user-id (gateway X-User-Id, 감사용)
     * @param requesterName 요청자 표시명 (gateway X-User-Name, UUID 비공개 가드)
     * @return 복사 생성된 전표 상세 (status=DRAFT, 라인·세트 계보 포함)
     * @throws BusinessException(NOT_FOUND) 원본 미존재/삭제
     * @throws BusinessException(CONFLICT) OUTBOUND 당일 마감 초과
     */
    @Transactional
    public SlipDetailResponse duplicate(UUID sourceSlipId, String requesterId, String requesterName) {
        Slip source = slipRepository.findById(sourceSlipId)
                .filter(slip -> !Boolean.TRUE.equals(slip.getIsDeleted()))
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "전표를 찾을 수 없습니다"));

        // 1. 채번 — 복사본은 오늘 일자의 신규 전표
        LocalDate slipDate = LocalDate.now(clock);
        closedDateGuard.assertCreatable(source.getSlipType(), slipDate, requesterId);
        String slipNo = slipNumberService.next(slipDate, source.getSlipType());
        int seqNo = slipNumberService.extractSeqNo(slipNo);

        // 2. 헤더 생성 — FE duplicateSlip 이 승계하던 범위(창고/거래처/배송태그/메모)와 동일
        Slip copy;
        if (source.getSlipType() == SlipType.OUTBOUND) {
            copy = Slip.createOutbound(slipNo, slipDate, seqNo,
                    source.getSourceWarehouseId(), source.getDestinationWarehouseId(),
                    source.getPartnerId(), source.getPartnerName(),
                    source.getDeliveryTag(), source.getMemo(), requesterId);
            copy.setSourceWarehouseCode(source.getSourceWarehouseCode());
            // 복사도 신규 출고 생성이다 — 태그 null 이면 게이트 내부에서 즉시 통과(opt-in).
            cutoffGuard.assertWithinCutoff(copy.getDeliveryTag(), copy.getSlipDate(),
                    source.getSlipType(), requesterId);
        } else {
            copy = Slip.createInbound(slipNo, slipDate, seqNo,
                    source.getDestinationWarehouseId(),
                    source.getPartnerId(), source.getPartnerName(),
                    source.getDeliveryTag(), source.getMemo(), requesterId);
        }

        // 3. 라인 복사 — 금액 권위값 + 세트 계보 verbatim 승계 (R6-H2 핵심)
        List<PartnerProductPriceMemoryCommand> priceMemoryCommands = new ArrayList<>();
        for (SlipLine line : source.getLines()) {
            if (Boolean.TRUE.equals(line.getIsDeleted())) {
                continue;
            }
            SlipLine copied = SlipLine.copyOf(copy, line);
            copy.addLine(copied);
            collectPriceMemory(priceMemoryCommands, copy.getPartnerId(), copied, requesterId);
        }
        if (copy.getLines().isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "복사할 라인이 없는 전표입니다");
        }

        // 4. 배송일정 — 신규 생성 규칙으로 재계산 (원본 unloadDate 는 원본 일자 기준이라 미승계)
        copy.applyDeliverySchedule(copy.getDeliveryTag(), null);

        // 5. 기사 정보 승계 (FE 복사 계약 동일)
        if (source.getDriverName() != null || source.getDriverPhone() != null) {
            copy.setDriverContact(source.getDriverName(), source.getDriverPhone());
        }

        // 6. 이카운트 스키마 — 신규 생성 기본값 (ioType slipType 분기 / timeDate 서버 시각).
        //    FE 복사 계약과 동일하게 원본 V16 고객 필드는 승계하지 않는다.
        String ioType = source.getSlipType() == SlipType.OUTBOUND ? "10" : "11";
        String timeDate = LocalTime.now(clock).format(DateTimeFormatter.ofPattern("HHmmss"));
        copy.applyEcountSchema(ioType, timeDate,
                null, null, null, null, null, null, null, null, null, null);

        // 7. businessNumber / partnerCode — partnerId 로 재-resolve (실패 시 NULL 유지, 생성과 동일)
        if (copy.getPartnerId() != null) {
            partnerInternalClient.resolveBusinessNumber(copy.getPartnerId())
                    .ifPresent(businessNumber -> copy.withProjectInfo(
                            businessNumber, null, null, null, null, null));
            partnerInternalClient.resolvePartnerCode(copy.getPartnerId())
                    .ifPresent(copy::setPartnerCode);
        }

        Slip saved = slipRepository.save(copy);
        // 생성과 동일 — CREATE 스냅샷 1건 캡처 (revision 1). [UUID 비공개 가드] 표시명 우선.
        slipRevisionService.capture(saved, SlipRevisionType.CREATE, null,
                parseActorId(requesterId), resolveActorName(requesterName), null);
        priceMemoryService.rememberBatchAfterCommit(priceMemoryCommands, "slip.duplicate");
        return SlipDetailResponse.from(saved);
    }

    /**
     * 복사 라인의 가격기억 수집 — 세트 구성품 제외(spec §24), 비구성품만 {@code LINE_SAVE}.
     *
     * <p>VAT 포함 단가가 있으면 그 값을 그대로(복사 왕복 무손실), legacy 라인(VAT null)은
     * 공급단가 ×1.1 로 공용 store 기준에 정규화한다 — FE 복사 경로의 기존 기억 의미와 동일.
     */
    private void collectPriceMemory(List<PartnerProductPriceMemoryCommand> commands,
                                    UUID partnerId, SlipLine line, String actor) {
        if (partnerId == null || line.getProductId() == null
                || BundleLineageResolver.isBundleComponent(line)) {
            return;
        }
        BigDecimal vatInclusive = line.getUnitPriceWithVat() != null
                ? line.getUnitPriceWithVat()
                : line.getUnitPrice() == null
                        ? null
                        : line.getUnitPrice().multiply(new BigDecimal("1.1"))
                                .setScale(2, RoundingMode.HALF_UP);
        if (vatInclusive == null) {
            return;
        }
        commands.add(new PartnerProductPriceMemoryCommand(
                partnerId, line.getProductId(), vatInclusive,
                PartnerProductPriceMemory.SOURCE_LINE_SAVE, actor));
    }

    /** X-User-Id → 감사용 UUID. UUID 형식이 아니면 가상 system UUID (SlipService 패턴 미러). */
    private UUID parseActorId(String callerId) {
        if (callerId == null || callerId.isBlank()) {
            return new UUID(0L, 0L);
        }
        try {
            return UUID.fromString(callerId);
        } catch (IllegalArgumentException ex) {
            return new UUID(0L, 0L);
        }
    }

    /**
     * 버전이력 actorName UUID 비공개 가드 — X-User-Name 이 UUID 형태이거나 없으면 null
     * ([[uuid-no-user-visibility]], SlipService.resolveActorName 미러).
     */
    private String resolveActorName(String callerName) {
        if (callerName == null || callerName.isBlank()) {
            return null;
        }
        return ActorDisplayName.resolveNullable(null, callerName);
    }
}
