package com.samhanair.logis.slip.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.audit.service.SlipAuditLogService;
import com.samhanair.logis.slip.client.ApprovalLineAuthorizeClient;
import com.samhanair.logis.slip.client.ApprovalLineAuthorizeResult;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ExpandedLineDto;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.domain.CompensationOperation;
import com.samhanair.logis.slip.domain.CompensationPhase;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.service.cutoff.OutboundCutoffGuard;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.editrequest.domain.SlipEditRequest;
import com.samhanair.logis.slip.editrequest.service.SlipEditRequestService;
import com.samhanair.logis.slip.realtime.SlipRealtimeBroker;
import com.samhanair.logis.slip.price.domain.PartnerProductPriceMemory;
import com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryCommand;
import com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryService;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.service.dispatchgroup.DispatchGroupSlipReferenceGuard;
import com.samhanair.logis.slip.revision.domain.SlipRevisionType;
import com.samhanair.logis.slip.revision.repository.SlipRevisionRepository;
import com.samhanair.logis.slip.revision.service.SlipRevisionService;
import com.samhanair.logis.slip.web.dto.AddLineRequest;
import com.samhanair.logis.slip.web.dto.CreateSlipRequest;
import com.samhanair.logis.slip.web.dto.EditHeaderRequest;
import com.samhanair.logis.slip.web.dto.SlipDetailResponse;
import com.samhanair.logis.slip.web.dto.SlipResponse;
import com.samhanair.logis.slip.web.dto.SlipSearchResult;
import com.samhanair.logis.slip.web.dto.UpdateSlipDriverRequest;
import com.samhanair.logis.slip.web.dto.UpdateSlipRequest;
import jakarta.persistence.OptimisticLockException;
import jakarta.persistence.criteria.Predicate;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 전표 워크플로우 (Plan §3.1 — 출고/입고 + 배송일정 M상N하 V52).
 *
 * <p>Inventory 연계 (Q2 결정):
 * <ul>
 *   <li>OUTBOUND accept → {@code /inventory/reserve} 라인별 호출</li>
 *   <li>OUTBOUND complete → {@code /inventory/deduct} fromReservation=true 라인별 호출</li>
 *   <li>INBOUND complete → {@code /inventory/lots/inbound} 라인별 호출</li>
 *   <li>OUTBOUND reject/cancel after ACCEPTED → {@code /inventory/release} 라인별 호출</li>
 * </ul>
 *
 * <p>배송일정(M상N하):
 * <ul>
 *   <li>지방(REGION)/야적(STACK) 태그 시 {@link Slip#applyDeliverySchedule} 로 하차일(N) 자동 계산</li>
 *   <li>unloadDate override 전달 시 사용자 직접 지정 (당착 = slipDate)</li>
 *   <li>비적용 태그(DAY/LOGEN 등) 또는 태그 null 이면 unloadDate = null</li>
 * </ul>
 *
 * <p>낙관적 락(@Version) 충돌은 OptimisticLockException → CONFLICT 매핑.
 *
 * <p>상태 전이는 {@link Slip} 도메인 메서드에 위임 — 위반은 모두 BusinessException(CONFLICT).
 */
@Service
@Transactional
@RequiredArgsConstructor
@Slf4j
public class SlipService {

    private static final String SLIP_REF_TYPE = "SLIP";
    private static final String SLIP_OUTBOUND_DOCUMENT_TYPE = "SLIP_OUTBOUND";
    private static final String SLIP_INBOUND_DOCUMENT_TYPE = "SLIP_INBOUND";
    private static final String OUTBOUND_DISPATCH_ACTION_KEY = "OUTBOUND_DISPATCH";
    private static final String OUTBOUND_INSPECT_ACTION_KEY = "OUTBOUND_INSPECT";
    private static final String INBOUND_RECEIVE_ACTION_KEY = "INBOUND_RECEIVE";
    private static final String INBOUND_INSPECT_ACTION_KEY = "INBOUND_INSPECT";

    private final SlipRepository slipRepository;
    private final SlipNumberService slipNumberService;
    private final ProductClient productClient;
    private final InventoryClient inventoryClient;
    private final ApprovalLineAuthorizeClient approvalLineAuthorizeClient;
    private final SlipAuditLogService auditLogService;
    /** PR-H3 — 사용자 명시 잠금 정책 mutation 가드 + APPROVED 1회 소진. */
    private final SlipEditRequestService editRequestService;
    /**
     * V20 — partner-service Feign client. businessNumber snapshot 자동 resolve.
     * Feign fail 시 graceful fallback (businessNumber=NULL 유지).
     */
    private final PartnerInternalClient partnerInternalClient;
    /**
     * SP-08-5-5 — user-service internal client. 단건 GET ownerFullName resolve.
     * 호출 실패 시 graceful fallback (ownerFullName=NULL 유지).
     */
    private final UserInternalClient userInternalClient;
    /** 신규 OUTBOUND 저장 후 inventory warehouse code를 best-effort 보강한다. */
    private final WarehouseCodeSnapshotService warehouseCodeSnapshotService;
    /**
     * 권한 재편 Phase 2.1 Task 2 — 전표 버전이력 스냅샷 캡처.
     * create/updateSlip/applyOverlayPatch mutation 성공 직후 같은 트랜잭션에서 capture 호출.
     */
    private final SlipRevisionService slipRevisionService;
    /** S2d-1 — 임계 전이 시점 저장 revision anchor 조회. */
    private final SlipRevisionRepository slipRevisionRepository;
    /**
     * 권한 재편 Phase 2.1 Task 3 — 복원 SSE broadcast 용 실시간 브로커.
     * point-in-time 복원 성공 직후 {@code slip:restored} 이벤트를 publish 한다
     * ({@link SlipAuditLogService} 의 broker 주입 패턴과 동일 — InMemoryRealtimeBroker facade bean).
     */
    private final SlipRealtimeBroker broker;
    private final CompensationAuditWriter compensationAuditWriter;
    /** #809 — 거래처+품목 최근 VAT 포함 입력단가 기억. 실패해도 전표 저장은 계속된다. */
    private final PartnerProductPriceMemoryService priceMemoryService;
    /** 출고전표 배송태그별 마감 시각 게이트 — 생성 6경로 + editHeader 2경로. */
    private final OutboundCutoffGuard cutoffGuard;
    /** KST 기준 오늘 — 컷오프 게이트와 동일 Clock. */
    private final Clock clock;
    private final DispatchGroupSlipReferenceGuard dispatchGroupSlipReferenceGuard;

    /**
     * 전표 라인 추가 — BUNDLE(세트)면 product-service expand 로 구성품 라인 N개 전개(첫 setHead+parentSetModel),
     * 아니면 1 라인. 견적 경로(EstimateService)와 동일 전개 엔진. 직접 전표생성·등록품목 사용(개발책임자).
     */
    private void addSlipLinesExpanded(Slip slip, UUID productId, ProductSummary summary,
                                      String reqName, String reqModel, String specification, int quantity,
                                      java.math.BigDecimal unitPrice, String note,
                                      com.samhanair.logis.slip.estimate.web.dto.BundleSetOptions setOptions,
                                      boolean priceVatInclusive, java.math.BigDecimal supplyAmount,
                                      java.math.BigDecimal vatAmount, java.math.BigDecimal lineTotalWithVat,
                                      String actor,
                                      List<PartnerProductPriceMemoryCommand> priceMemoryCommands) {
        boolean authoritative = AuthoritativeAmountValidator.isComplete(
                supplyAmount, vatAmount, lineTotalWithVat);
        boolean bundle = summary != null && "BUNDLE".equals(summary.productType())
                && summary.modelCode() != null && !summary.modelCode().isBlank();
        if (bundle && authoritative) {
            throw new com.samhanair.logis.common.exception.BusinessException(
                    com.samhanair.logis.common.exception.ErrorCode.INVALID_INPUT,
                    "세트 구성품의 공급가액·부가세는 개별 편집할 수 없습니다");
        }
        if (!bundle) {
            String productName = reqName != null ? reqName : (summary != null ? summary.name() : null);
            String modelName = reqModel != null ? reqModel : (summary != null ? summary.modelName() : null);
            // 단가 부가세포함 전환: priceVatInclusive 면 라인 단위로 공급가액/부가세 분리.
            slip.addLine(authoritative
                    ? SlipLine.createFromAuthoritativeAmounts(slip, productId, productName, modelName,
                            specification, quantity, unitPrice, supplyAmount, vatAmount, lineTotalWithVat, note, null)
                    : priceVatInclusive
                    ? SlipLine.createFromVatInclusive(slip, productId, productName, modelName,
                            specification, quantity, unitPrice, note, null)
                    : SlipLine.create(slip, productId, productName, modelName,
                            specification, quantity, unitPrice, note));
            collectPriceMemory(priceMemoryCommands, slip.getPartnerId(), productId, unitPrice,
                    priceVatInclusive, PartnerProductPriceMemory.SOURCE_LINE_SAVE, actor);
            return;
        }
        collectPriceMemory(priceMemoryCommands, slip.getPartnerId(), productId, unitPrice,
                priceVatInclusive, PartnerProductPriceMemory.SOURCE_BUNDLE_SET, actor);
        ExpandedLineDto.Options opts = setOptions == null ? null : new ExpandedLineDto.Options(
                setOptions.remoteOption(), Boolean.TRUE.equals(setOptions.remoteExcluded()),
                setOptions.panelOption(), setOptions.panelShape360(),
                Boolean.TRUE.equals(setOptions.materialIncluded()));
        // 세트 base 단가도 VAT 포함 그대로 expand 에 전달 → 구성품 단가도 VAT 포함으로 재배분.
        List<ExpandedLineDto> expanded = productClient.expand(
                summary.modelCode(), java.math.BigDecimal.valueOf(quantity), opts, unitPrice);
        int added = 0;
        for (ExpandedLineDto el : expanded) {
            if (el.productId() == null) {
                continue;
            }
            int q = el.quantity() == null ? quantity
                    : el.quantity().setScale(0, java.math.RoundingMode.HALF_UP).intValue();
            if (q <= 0) {
                q = 1;
            }
            java.math.BigDecimal compUnit = el.unitPrice() == null ? java.math.BigDecimal.ZERO : el.unitPrice();
            // #24: 구성품 규격은 GAS '규격'(el.specification) 우선, 없으면 요청 규격.
            String compSpec = el.specification() != null && !el.specification().isBlank()
                    ? el.specification() : specification;
            SlipLine line = priceVatInclusive
                    ? SlipLine.createFromVatInclusive(slip, el.productId(), el.name(), el.modelName(),
                            compSpec, q, compUnit, note, null)
                    : SlipLine.create(slip, el.productId(), el.name(), el.modelName(),
                            compSpec, q, compUnit, note);
            line.assignBundleComponent(summary.modelCode(), el.setHead());
            slip.addLine(line);
            added++;
        }
        // 구성품 일부라도 미등록 skip 시 재배분 세트가 일부 silent 손실 → 전부/일부 모두 명시 예외.
        if (added == 0 || added < expanded.size()) {
            throw new com.samhanair.logis.common.exception.BusinessException(
                    com.samhanair.logis.common.exception.ErrorCode.NOT_FOUND,
                    "세트 구성품 일부를 찾을 수 없습니다(미등록/단종): " + summary.modelCode());
        }
    }

    /**
     * 새 전표를 DRAFT 상태로 생성한다 — slipType 분기로 createOutbound/createInbound 호출,
     * ProductClient 로 라인 productId 일괄 검증, 라인 추가,
     * {@link Slip#applyDeliverySchedule} 으로 하차일(N) 계산 후 SlipNumberService 로 채번.
     *
     * @param req 생성 요청 (slipType / slipDate / 창고 / 거래처 / 라인 등)
     * @param requesterId 요청자 user-id (gateway X-User-Id 또는 "system", 감사용 actorId)
     * @param requesterName 요청자 표시명 (gateway X-User-Name, UUID 비공개 가드 — 버전이력 actorName)
     * @return 생성된 전표의 상세 응답 (라인 포함, status=DRAFT)
     * @throws BusinessException(INVALID_INPUT) 라인 productId 중 product-service 미존재 또는 입력 불량
     * @throws BusinessException(INTERNAL_ERROR) product-service 호출 실패
     * @throws BusinessException(INVALID_INPUT) 출고전표 sourceWarehouseId null, 입고전표 destinationWarehouseId null 또는 입력 불량
     */
    public SlipDetailResponse create(CreateSlipRequest req, String requesterId, String requesterName) {
        // 1. 라인 productId 일괄 검증 + lookup map 빌드 (snapshot 보강)
        List<UUID> productIds = req.lines().stream()
                .map(CreateSlipRequest.SlipLineRequest::productId)
                .distinct()
                .toList();
        List<ProductSummary> summaries = productClient.lookup(productIds);
        Map<UUID, ProductSummary> byId = new HashMap<>();
        for (ProductSummary s : summaries) {
            byId.put(s.id(), s);
        }

        // 2. 채번 (slipDate null 이면 today)
        LocalDate slipDate = req.slipDate() == null ? LocalDate.now(clock) : req.slipDate();
        String slipNo = slipNumberService.next(slipDate, req.slipType());
        int seqNo = slipNumberService.extractSeqNo(slipNo);

        // 3. 헤더 생성
        Slip slip;
        if (req.slipType() == SlipType.OUTBOUND) {
            slip = Slip.createOutbound(slipNo, slipDate, seqNo,
                    req.sourceWarehouseId(), req.destinationWarehouseId(),
                    req.partnerId(), req.partnerName(),
                    req.deliveryTag(), req.memo(), requesterId);
            // [게이트①] 출고전표 수동 생성 마감 게이트 — createOutbound 직후, save 직전.
            // 태그 null(미지정) 이면 assertWithinCutoff 내부에서 즉시 통과(opt-in).
            cutoffGuard.assertWithinCutoff(slip.getDeliveryTag(), slip.getSlipDate());
        } else {
            slip = Slip.createInbound(slipNo, slipDate, seqNo,
                    req.destinationWarehouseId(),
                    req.partnerId(), req.partnerName(),
                    req.deliveryTag(), req.memo(), requesterId);
        }

        // 4. 라인 추가 — 직접 전표생성도 등록품목으로(개발책임자). BUNDLE(세트)면 product-service expand
        //    로 구성품 라인 N개 전개(견적 경로와 동일 단일 엔진), 아니면 1 라인.
        List<PartnerProductPriceMemoryCommand> priceMemoryCommands = new ArrayList<>();
        for (CreateSlipRequest.SlipLineRequest lineReq : req.lines()) {
            addSlipLinesExpanded(slip, lineReq.productId(), byId.get(lineReq.productId()),
                    lineReq.productName(), lineReq.modelName(), lineReq.specification(),
                    lineReq.quantity(), lineReq.unitPrice(), lineReq.note(), lineReq.setOptions(),
                    Boolean.TRUE.equals(lineReq.priceVatInclusive()), lineReq.supplyAmount(),
                    lineReq.vatAmount(), lineReq.lineTotalWithVat(), requesterId, priceMemoryCommands);
        }

        // 5. 배송일정 계산 (지방/야적 태그 시 하차일 N 자동 산출 또는 override 적용)
        // [게이트①-배송일정] 마감 게이트 통과 직후. override 없으면 규칙 자동 계산.
        slip.applyDeliverySchedule(slip.getDeliveryTag(), req.unloadDate());

        // 6. Slice B — driverName/driverPhone 생성 시점 적용 (모두 nullable, OUTBOUND 한정 의미)
        if (req.driverName() != null || req.driverPhone() != null) {
            slip.setDriverContact(req.driverName(), req.driverPhone());
        }

        // 7. PR-G1 backlog #2 — V16 e-Count 12 컬럼 직접 저장 (publish 흐름과 동일).
        // ioType null 시 slipType 분기 자동 ("10"=OUTBOUND / "11"=INBOUND).
        // timeDate null 시 서버 시각 (HHmmss) 자동.
        String resolvedIoType = req.ioType();
        if (resolvedIoType == null || resolvedIoType.isBlank()) {
            resolvedIoType = req.slipType() == SlipType.OUTBOUND ? "10" : "11";
        }
        String resolvedTimeDate = req.timeDate();
        if (resolvedTimeDate == null || resolvedTimeDate.isBlank()) {
            resolvedTimeDate = java.time.LocalTime.now().format(
                    java.time.format.DateTimeFormatter.ofPattern("HHmmss"));
        }
        slip.applyEcountSchema(
                resolvedIoType, resolvedTimeDate,
                req.customerTel(), req.customerAddress(), req.customerRepresentative(),
                req.shippingAddress(), req.inspectionAddress(), req.receiverPhone(),
                req.paymentDueLabel(), req.discountInfo(),
                req.collectTerm(), req.agreeTerm());

        // 8. V20 — 판매/구매조회 신규 5 필드 저장
        // businessNumber: partnerId 가 있으면 partner-service Feign 자동 resolve.
        //                 Feign fail 시 NULL 유지 (legacy 호환, 로그만).
        String resolvedBusinessNumber = resolveBusinessNumber(req.partnerId());
        // partnerCode snapshot (2026-06-10) — 거래명세서 공급받는자 주소/대표번호가 FE 에서
        // getPartnerFull(partnerCode) 로 조회되므로 생성 시점에 resolve. 실패 시 NULL 유지.
        if (req.partnerId() != null) {
            partnerInternalClient.resolvePartnerCode(req.partnerId())
                    .ifPresent(slip::setPartnerCode);
        }
        slip.withProjectInfo(
                resolvedBusinessNumber,
                req.deliveryAddress(),
                req.supervisionAddress(),
                req.projectName(),
                req.recipientPhone(),
                req.paymentDueDate());

        if (slip.getSlipType() == SlipType.OUTBOUND) {
            slip.markSourceWarehouseCodePending();
        }

        Slip saved = slipRepository.save(slip);
        if (saved.getSlipType() == SlipType.OUTBOUND) {
            warehouseCodeSnapshotService.scheduleAfterCommit(
                    saved.getId(), saved.getSourceWarehouseId());
        }
        // 권한 재편 Phase 2.1 Task 2 — 생성 직후 CREATE 스냅샷 1건 캡처 (revision 1)
        // [UUID 비공개 가드] actorName 은 X-User-Name 우선, 없거나 UUID 형태면 null
        slipRevisionService.capture(saved, SlipRevisionType.CREATE, null,
                parseActorId(requesterId), resolveActorName(requesterName, requesterId), null);
        priceMemoryService.rememberBatchAfterCommit(priceMemoryCommands, "slip.create");
        return SlipDetailResponse.from(saved);
    }

    /**
     * 헤더 부분 수정 — DRAFT/SAVED 단계만. 도메인 메서드가 가드.
     *
     * <p>PR-H2 (Phase 12 Step 2) — memo 변경 시 audit overlay 1행 + SSE broadcast 자동 적용.
     * audit overlay 시범 한정 (PR-H4 에서 partnerName/deliveryTag/driver* 등 확장 예정).
     * 본 PR 의 시범 = "memo" 단일 필드만 audit (사용자 자유 입력 — 가장 빈번한 수정).
     *
     * @param id 전표 ID
     * @param req 수정 요청 (null 필드는 보존)
     * @param callerId 호출자 user-id (감사용 — audit actor + audit broker payload + revision actorId)
     * @param callerName 호출자 표시명 (X-User-Name, UUID 비공개 가드 — 버전이력 actorName)
     * @return 갱신된 상세 응답
     * @throws BusinessException(NOT_FOUND) 전표 미발견
     * @throws BusinessException(CONFLICT) 현재 상태가 DRAFT/SAVED 가 아닐 때
     */
    public SlipDetailResponse editHeader(UUID id, EditHeaderRequest req, String callerId,
                                         String callerName) {
        Slip slip = loadOrThrow(id);
        // [게이트⑦] 배송태그 확정(신규/변경) 마감 게이트 — applyMutation 직전.
        // 태그 미변경(memo/driver만 수정) 또는 null 보존 경우는 게이트 미적용.
        DeliveryTag incomingTag = req.deliveryTag();
        boolean tagChanged = incomingTag != null && incomingTag != slip.getDeliveryTag();
        if (tagChanged) {
            cutoffGuard.assertWithinCutoff(incomingTag, slip.getSlipDate());
        }
        // PR-H2 — memo 변경분 audit 사전 snapshot (도메인 mutation 직전 oldValue 보존)
        String oldMemo = slip.getMemo();
        applyMutation(() -> slip.editHeader(req.partnerId(), req.partnerName(),
                req.deliveryTag(), req.memo(), req.driverName(), req.driverPhone()));
        // [게이트⑦-배송일정] 태그 신규/변경 OR unloadDate override 시에만 재계산.
        // 태그 미변경+unloadDate 미전달이면 기존 unloadDate 유지(사용자 override 보존 — Codex 라운드 회귀 fix).
        if (tagChanged || req.unloadDate() != null) {
            slip.applyDeliverySchedule(slip.getDeliveryTag(), req.unloadDate());
        }
        // PR-H2 — memo 실제 변경 (newValue != oldValue) 감지 시 audit overlay 1행 + SSE broadcast
        String newMemo = slip.getMemo();
        if (req.memo() != null && !java.util.Objects.equals(oldMemo, newMemo)) {
            UUID actorId = parseActorId(callerId);
            String actorName = callerId == null || callerId.isBlank() ? "system" : callerId;
            auditLogService.recordOverlayPatch(id, actorId, actorName, null,
                    "memo", oldMemo, newMemo);
        }
        // 권한 재편 Phase 2.1 — 헤더 batch 수정(partnerId/partnerName/deliveryTag/memo 모두 toSnapshot 필드)도
        // 버전이력에 잡히도록 EDIT 스냅샷 캡처. applyMutation 가드를 통과한 성공 경로에서만 도달한다.
        // [UUID 비공개 가드] actorName 은 X-User-Name 우선, 없거나 UUID 형태면 null
        slipRevisionService.capture(slip, SlipRevisionType.EDIT, null,
                parseActorId(callerId), resolveActorName(callerName, callerId), null);
        return SlipDetailResponse.from(slip);
    }

    /**
     * 기사 정보 부분 수정 — DRAFT/SAVED 단계만. 도메인 메서드가 가드.
     *
     * <p>link-dispatch-slice — FE {@code updateSlipDriver()} ({@code PATCH /slips/{id}/driver}) 대응.
     * 출고 슬립의 배송 기사명/연락처만 부분 갱신한다. driver 외 헤더 필드는 모두 null 로 전달해
     * 보존하며, {@link Slip#editHeader} 의 null-보존 + 편집 가능 상태 가드를 그대로 따른다.
     *
     * @param id 전표 ID
     * @param req 기사 정보 수정 요청 (null 필드는 보존)
     * @param callerId 호출자 user-id (감사용 — revision actorId)
     * @param callerName 호출자 표시명 (X-User-Name, UUID 비공개 가드 — 버전이력 actorName)
     * @return 갱신된 상세 응답
     * @throws BusinessException(NOT_FOUND) 전표 미발견
     * @throws BusinessException(CONFLICT) 현재 상태가 DRAFT/SAVED 가 아닐 때
     */
    public SlipDetailResponse editDriver(UUID id, UpdateSlipDriverRequest req, String callerId,
                                         String callerName) {
        Slip slip = loadOrThrow(id);
        applyMutation(() -> slip.editHeader(null, null, null, null,
                req.driverName(), req.driverPhone()));
        // 권한 재편 Phase 2.1 — 기사 정보 변경(driverName/driverPhone 은 toSnapshot 필드)도 버전이력에
        // 잡히도록 EDIT 스냅샷 캡처. applyMutation 가드를 통과한 성공 경로에서만 도달한다.
        // [UUID 비공개 가드] actorName 은 X-User-Name 우선, 없거나 UUID 형태면 null
        slipRevisionService.capture(slip, SlipRevisionType.EDIT, null,
                parseActorId(callerId), resolveActorName(callerName, callerId), null);
        return SlipDetailResponse.from(slip);
    }

    /**
     * 전표 헤더 + V20 프로젝트 정보 통합 수정 — DRAFT/SAVED 단계만.
     *
     * <p>V20 신규 5 필드 (deliveryAddress / supervisionAddress / projectName / recipientPhone /
     * paymentDueDate) 를 부분 갱신한다. null 이면 기존 값 보존.
     *
     * <p>partnerId 가 변경되거나 businessNumber 가 아직 null 인 경우, partner-service Feign 을 호출하여
     * businessNumber 를 자동 resolve 하고 snapshot. Feign fail 시 기존 값 유지 (legacy 호환).
     *
     * @param id 전표 ID
     * @param req 수정 요청 (null 필드는 보존)
     * @param callerId 호출자 user-id (감사용 — revision actorId)
     * @param callerName 호출자 표시명 (X-User-Name, UUID 비공개 가드 — 버전이력 actorName)
     * @return 갱신된 상세 응답
     * @throws BusinessException(NOT_FOUND) 전표 미발견
     * @throws BusinessException(CONFLICT) 현재 상태가 DRAFT/SAVED 가 아닐 때
     */
    public SlipDetailResponse updateSlip(UUID id, UpdateSlipRequest req, String callerId,
                                         String callerName) {
        Slip slip = loadOrThrow(id);
        // [게이트⑧] 배치 헤더 수정 — 배송태그 신규/변경 시 마감 게이트 적용.
        // 태그 미변경(memo/driver/partnerName 등만 수정) 또는 null 보존 경우는 게이트 미적용.
        DeliveryTag incomingTagBatch = req.deliveryTag();
        boolean tagChangedBatch = incomingTagBatch != null && incomingTagBatch != slip.getDeliveryTag();
        if (tagChangedBatch) {
            cutoffGuard.assertWithinCutoff(incomingTagBatch, slip.getSlipDate());
        }
        // editHeader 가 partnerId 를 덮어쓰기 전에 캡처 — partnerCode 진짜 변경 판정용 (사이클2 BE)
        UUID previousPartnerId = slip.getPartnerId();
        // 기존 헤더 필드 수정 (도메인 메서드 chain — Slip.editHeader)
        applyMutation(() -> slip.editHeader(req.partnerId(), req.partnerName(),
                req.deliveryTag(), req.memo(), req.driverName(), req.driverPhone()));

        // V20 5 필드 부분 갱신 (Slip.withProjectInfo — null 이면 기존 값 보존)
        // businessNumber: partnerId 변경 시 새로 resolve. 기존 businessNumber 가 이미 있고
        // partnerId 변경이 없으면 기존 값 유지 (불필요한 Feign 호출 회피).
        UUID effectivePartnerId = req.partnerId() != null ? req.partnerId() : slip.getPartnerId();
        String resolvedBusinessNumber = null;
        if (effectivePartnerId != null && (slip.getBusinessNumber() == null || req.partnerId() != null)) {
            resolvedBusinessNumber = resolveBusinessNumber(effectivePartnerId);
        }
        // partnerCode snapshot (2026-06-10) — partnerId 변경 또는 기존 NULL 시 resolve.
        // '진짜 변경'(이전 partnerId 와 상이) 시에만 resolve 실패를 NULL clear 로 처리 —
        // 이전 거래처 code 잔존(stale) 방지 (사이클1 P1). 같은 partnerId 재전송(FE 전체필드
        // 전송 관행)은 백필 의미론(성공 시만 채움)이라 정상 code 가 clear 되지 않음 (사이클2 P1).
        boolean partnerActuallyChanged =
                req.partnerId() != null && !req.partnerId().equals(previousPartnerId);
        if (effectivePartnerId != null && (slip.getPartnerCode() == null || partnerActuallyChanged)) {
            java.util.Optional<String> resolvedCode =
                    partnerInternalClient.resolvePartnerCode(effectivePartnerId);
            if (partnerActuallyChanged) {
                slip.setPartnerCode(resolvedCode.orElse(null));
            } else {
                resolvedCode.ifPresent(slip::setPartnerCode);
            }
        }
        slip.withProjectInfo(
                resolvedBusinessNumber,
                req.deliveryAddress(),
                req.supervisionAddress(),
                req.projectName(),
                req.recipientPhone(),
                req.paymentDueDate());

        // [게이트⑧-배송일정] 태그 신규/변경 OR unloadDate override 시에만 재계산.
        // 태그 미변경+unloadDate 미전달이면 기존 unloadDate 유지(사용자 override 보존 — Codex 라운드 회귀 fix).
        if (tagChangedBatch || req.unloadDate() != null) {
            slip.applyDeliverySchedule(slip.getDeliveryTag(), req.unloadDate());
        }

        // 권한 재편 Phase 2.1 Task 2 — 수정 성공 직후 EDIT 스냅샷 캡처
        // [UUID 비공개 가드] actorName 은 X-User-Name 우선, 없거나 UUID 형태면 null
        slipRevisionService.capture(slip, SlipRevisionType.EDIT, null,
                parseActorId(callerId), resolveActorName(callerName, callerId), null);
        return SlipDetailResponse.from(slip);
    }

    /**
     * audit overlay 단일 필드 patch + SSE broadcast — PR-H2 신규.
     *
     * <p>FE 가 본 endpoint 호출 시 즉시 audit row INSERT + 모든 SSE 구독자에게 push. 라이프사이클
     * 가드는 도메인 {@link Slip#applyOverlayPatch} 내부 (마감 lock 만 가드 — overlay 는 어떤
     * 단계에서도 가능하도록 시범).
     *
     * @param id 전표 ID
     * @param fieldName 필드 식별자 (memo/shippingAddress/...)
     * @param newValue 새 값 (null 가능 — 필드 clear)
     * @param callerId 호출자 user-id (audit actor)
     * @param callerName 호출자 표시명 (UUID 비공개 가드, null 이면 callerId 사용)
     * @return 갱신된 상세 응답
     * @throws BusinessException(NOT_FOUND) 전표 미발견
     * @throws BusinessException(INVALID_INPUT) 미지원 필드 또는 길이 초과
     * @throws BusinessException(CONFLICT) 마감 lock 적용 슬립
     */
    public SlipDetailResponse applyOverlayPatch(UUID id, String fieldName, String newValue,
                                                String callerId, String callerName) {
        Slip slip = loadOrThrow(id);
        // PR-H3 — 사용자 명시 잠금 정책 가드 (status 별 분기, APPROVED 1회 소진)
        Optional<SlipEditRequest> consumedApproval = guardLockPolicy(slip, callerId);
        String oldValue = slip.readOverlayField(fieldName);
        applyMutation(() -> slip.applyOverlayPatch(fieldName, newValue));
        String actualNew = slip.readOverlayField(fieldName);
        if (!java.util.Objects.equals(oldValue, actualNew)) {
            UUID actorId = parseActorId(callerId);
            String actorName = (callerName != null && !callerName.isBlank())
                    ? callerName
                    : (callerId == null || callerId.isBlank() ? "system" : callerId);
            auditLogService.recordOverlayPatch(id, actorId, actorName, null,
                    fieldName, oldValue, actualNew);
        }
        // PR-H3 — APPROVED 요청 소진 (재사용 차단)
        consumedApproval.ifPresent(approval ->
                editRequestService.consumeApproval(approval.getId(), callerId));
        // 권한 재편 Phase 2.1 Task 2 — overlay patch 성공 직후 EDIT 스냅샷 캡처
        // [UUID 비공개 가드] actorName 은 X-User-Name 우선, 없거나 UUID 형태면 null
        // (callerId(=UUID) 폴백 금지 — 버전이력에 UUID 노출 방지)
        slipRevisionService.capture(slip, SlipRevisionType.EDIT, null,
                parseActorId(callerId), resolveActorName(callerName, callerId), null);
        return SlipDetailResponse.from(slip);
    }

    /**
     * 협업 제안 수락 — 여러 overlay 필드를 단일 잠금 가드(물리 종결만 차단) / 단일 audit revision /
     * 단일 EDIT revision 으로 일괄 적용한다 (§7 협업, 개발책임자 2026-06-13 정책 정정).
     *
     * <p>제안 수락은 확정/완료 전표의 공인(authorized) 수정 경로다. 수락자(권한자)가 곧 승인자이므로
     * {@link #guardLockPolicy}(직접 편집용 — CONFIRMED/ACCEPTED/PROCESSING 단계에 APPROVED 수정요청 필요)와
     * 달리, 수락 시 즉시 적용 + 버전기록 + 알림이 이루어진다. <b>물리 종결 상태(배송중/배송완료/취소/반려)
     * 만 제외</b>한다({@link #guardCollabModifiable}).
     *
     * <p>변경분 수집·적용 묶음 계약(phantom SSE / EDIT revision 오염 차단 — Round C P2 이후 동일):
     * <ol>
     *   <li>루프에서 {@link SlipAuditLogService.ChangeEntry} 수집만 수행.</li>
     *   <li>모든 mutation·검증 통과 후 {@link SlipAuditLogService#recordBatch} 1회 기록.</li>
     *   <li>제안 1건 = audit revision_no 1 증가 + slip:edit SSE 1건 + EDIT revision 1건.</li>
     * </ol>
     *
     * @param id 전표 ID
     * @param patches 필드명 → 새 값 (순서 보존)
     * @param expectedBefore 필드명 → 편집 시작 시 클라이언트가 캡처한 baseline
     * @param callerId 호출자 user-id (audit actor)
     * @param callerName 호출자 표시명 (UUID 비공개 가드, null 이면 callerId 사용)
     * @return 갱신된 상세 응답
     * @throws BusinessException(NOT_FOUND) 전표 미발견
     * @throws BusinessException(INVALID_INPUT) 미지원 필드 또는 길이 초과
     * @throws BusinessException(CONFLICT) 물리 종결 전표 또는 필드별 baseline 충돌 — 협업 제안 수락 불가
     */
    public SlipDetailResponse applyOverlayPatchBatch(UUID id, Map<String, String> patches,
                                                     Map<String, String> expectedBefore,
                                                     String callerId, String callerName) {
        // 편집 화면이 아니라 실제 저장 구간만 행 잠금으로 직렬화한다. 잠금 획득 후 최신
        // 필드값을 baseline 과 비교하므로 서로 다른 필드는 JPA @Version 충돌 없이 병합된다.
        Slip slip = loadOrThrowForCollabUpdate(id);
        // 협업 수락 전용 가드 — 물리 종결(배송중/배송완료/취소/반려) 만 차단, APPROVED 소진 불요
        guardCollabModifiable(slip);
        // 전역 revision 잠금이 아니라 필드별 baseline 을 검증한다. 따라서 같은 필드의 stale
        // 저장은 409로 차단하면서, 서로 다른 필드를 편집한 협업 저장은 병합할 수 있다.
        for (String fieldName : patches.keySet()) {
            if (expectedBefore == null || !expectedBefore.containsKey(fieldName)
                    || !java.util.Objects.equals(expectedBefore.get(fieldName), slip.readOverlayField(fieldName))) {
                throw new BusinessException(ErrorCode.SLIP_OPTIMISTIC_LOCK_CONFLICT,
                        "전표 협업 수정 대상 필드가 이미 변경되었습니다. 최신 내용으로 다시 확인해 주세요.");
            }
        }
        UUID actorId = parseActorId(callerId);
        String auditActorName = (callerName != null && !callerName.isBlank())
                ? callerName
                : (callerId == null || callerId.isBlank() ? "system" : callerId);
        // 루프에서는 변경분 수집만 — audit 기록/SSE 발화는 모든 mutation·검증 통과 후 1회 (phantom 차단)
        List<SlipAuditLogService.ChangeEntry> changes = new ArrayList<>(patches.size());
        for (Map.Entry<String, String> patch : patches.entrySet()) {
            String fieldName = patch.getKey();
            String newValue = patch.getValue();
            String oldValue = slip.readOverlayField(fieldName);
            applyMutation(() -> slip.applyOverlayPatch(fieldName, newValue));
            String actualNew = slip.readOverlayField(fieldName);
            if (!java.util.Objects.equals(oldValue, actualNew)) {
                changes.add(new SlipAuditLogService.ChangeEntry(fieldName, oldValue, actualNew));
            }
        }
        // 제안 1건 = audit revision_no 1건 + slip:edit SSE 1건 + EDIT revision 1건 (변경 0건이면 모두 skip)
        if (!changes.isEmpty()) {
            auditLogService.recordBatch(id, actorId, auditActorName, null, changes);
            slipRevisionService.capture(slip, SlipRevisionType.EDIT, null,
                    actorId, resolveActorName(callerName, callerId), null);
        }
        return SlipDetailResponse.from(slip);
    }

    /**
     * 슬립 soft-delete — PR-H3 신규. 사용자 명시 잠금 정책 가드 후 BaseEntity.markDeleted 적용.
     *
     * <p>DRAFT/SAVED — 작성자 자유 삭제. CONFIRMED/ACCEPTED/PROCESSING — APPROVED 요청 1건 필요.
     * INSPECTING/SHIPPING/DELIVERED — 완전 잠금 (CONFLICT).
     *
     * @param id 전표 ID
     * @param callerId 삭제 수행자 user-id
     * @throws BusinessException(NOT_FOUND) 전표 미발견
     * @throws BusinessException(CONFLICT) 잠금 정책 위반 (APPROVED 부재 또는 완전 잠금)
     */
    public void softDelete(UUID id, String callerId) {
        Slip slip = loadOrThrow(id);
        Optional<SlipEditRequest> consumedApproval = guardLockPolicy(slip, callerId);
        dispatchGroupSlipReferenceGuard.assertDeletable(id);
        applyMutation(() -> slip.markDeleted(callerId == null ? "system" : callerId));
        consumedApproval.ifPresent(approval ->
                editRequestService.consumeApproval(approval.getId(), callerId));
    }

    /**
     * 전표를 특정 revision 시점으로 point-in-time 복원한다 (권한 재편 Phase 2.1 Task 3).
     *
     * <p>처리 순서:
     * <ol>
     *   <li>전표 조회 — 미존재 시 {@link ErrorCode#NOT_FOUND}</li>
     *   <li>{@link #guardLockPolicy} — status 별 마감 정책 가드 (FULLY_LOCKED/종결 단계 차단,
     *       LOCKED_REQUIRES_APPROVAL 단계는 APPROVED 요청 1건 필요, mutation 후 소진)</li>
     *   <li>{@link SlipRevisionService#restore} — 대상 스냅샷 로드 + 헤더/라인 통째 복원 +
     *       신규 RESTORE revision 캡처 (마감 lock 가드는 도메인이 책임)</li>
     *   <li>복원 mutation 을 사용자 수정 카운트에 반영하기 위한 {@code revisionCount} 1회 증가</li>
     *   <li>라인 전량 교체 영속화를 위한 명시 save</li>
     *   <li>{@code slip:restored} SSE broadcast (slipId + 복원 출처 revisionNo)</li>
     * </ol>
     *
     * @param slipId 복원 대상 전표 UUID
     * @param revisionNo 복원할 시점의 revisionNo (복원 출처)
     * @param callerId 복원 수행자 user-id (감사용 actor)
     * @param callerName 복원 수행자 표시명 (UUID 비공개 가드, null 이면 callerId 폴백)
     * @return 복원된 전표의 상세 응답
     * @throws BusinessException(NOT_FOUND) 전표 또는 대상 revision 미발견
     * @throws BusinessException(CONFLICT) 마감 정책 위반 또는 lock_flag=true 슬립
     */
    public SlipDetailResponse restoreToRevision(UUID slipId, int revisionNo,
                                                String callerId, String callerName) {
        Slip slip = loadOrThrow(slipId);
        // status 별 마감 정책 가드 (applyOverlayPatch/softDelete 와 동일 정책)
        Optional<SlipEditRequest> consumedApproval = guardLockPolicy(slip, callerId);
        // [UUID 비공개 가드] actorName 은 X-User-Name 우선, 없거나 UUID 형태면 null
        // (callerId(=UUID) 폴백 금지 — 버전이력에 UUID 노출 방지)
        String actorName = resolveActorName(callerName, callerId);
        applyMutation(() -> slipRevisionService.restore(slip, revisionNo,
                parseActorId(callerId), actorName, null));
        // 버전 복원도 사용자 관점의 수정이다. audit row 는 만들지 않고 slip_revisions RESTORE 행과
        // 표시 카운트(revisionCount-baseline)만 증가시켜 audit timeline 의 빈 revisionNo 노출을 피한다.
        slip.incrementRevision();
        // 라인 전량 교체(markDeleted + 신규 라인 add) 영속화
        slipRepository.save(slip);
        consumedApproval.ifPresent(approval ->
                editRequestService.consumeApproval(approval.getId(), callerId));
        // 복원 SSE broadcast — 동일 슬립 동시 편집자 화면 갱신 트리거
        Map<String, Object> payload = new HashMap<>();
        payload.put("slipId", slipId.toString());
        payload.put("revisionNo", revisionNo);
        broker.publish(slipId, "slip:restored", payload);
        return SlipDetailResponse.from(slip);
    }

    /**
     * 협업 제안 수락이 불가한 물리 종결 상태 — 배송 후/종결 전표는 제안 수락으로도 수정 불가.
     *
     * <p>개발책임자 2026-06-13 결정: SHIPPING/DELIVERED/CANCELED/REJECTED 만 차단.
     * CONFIRMED/ACCEPTED/PROCESSING/INSPECTING/COMPLETED 는 수락자가 곧 승인자 — 별도 APPROVED 불요.
     */
    private static final java.util.Set<SlipStatus> COLLAB_LOCKED = java.util.EnumSet.of(
            SlipStatus.SHIPPING, SlipStatus.DELIVERED, SlipStatus.CANCELED, SlipStatus.REJECTED);

    /**
     * 협업 제안 수락 가드 (개발책임자 2026-06-13 결정 — 수락=공인 수정, 잠금 우회).
     *
     * <p>제안 수락은 확정/완료 전표의 공인 수정 경로다. 직접편집 {@link #guardLockPolicy}(확정=APPROVED
     * 요청 필요)와 달리, 수락자(권한자)가 곧 승인자이므로 확정/완료/처리/검수 단계를 별도 승인 없이
     * 수정한다. 물리 종결(배송중/배송완료/취소/반려)만 차단한다.
     *
     * @param slip 대상 슬립
     * @throws BusinessException(CONFLICT) 물리 종결 상태 ({@link #COLLAB_LOCKED}) 의 전표
     */
    private void guardCollabModifiable(Slip slip) {
        SlipStatus s = slip.getStatus();
        if (COLLAB_LOCKED.contains(s)) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "현 단계 (" + s.getDisplayName() + ") 는 물리 종결 — 협업 제안 수락으로 수정할 수 없습니다");
        }
    }

    /**
     * PR-H3 잠금 정책 가드 — slip.status 별 분기.
     *
     * <ul>
     *   <li>DRAFT/SAVED/SENT — 자유 (return empty, 소진 없음)</li>
     *   <li>{@link SlipEditRequestService#LOCKED_REQUIRES_APPROVAL} (CONFIRMED/ACCEPTED/PROCESSING) —
     *       APPROVED 요청 1건 lookup → 없으면 CONFLICT, 있으면 호출자에게 반환 (mutation 후 소진)</li>
     *   <li>{@link SlipEditRequestService#FULLY_LOCKED} (INSPECTING/SHIPPING/DELIVERED) —
     *       항상 CONFLICT</li>
     *   <li>REJECTED/CANCELED — 의미 없음, CONFLICT (이미 종결된 슬립)</li>
     * </ul>
     *
     * @param slip 대상 슬립
     * @param callerId 호출자 user-id (현재는 audit 로그용, 향후 작성자 본인 가드 확장 여지)
     * @return 소진 대상 APPROVED 요청 (mutation 후 호출자가 consumeApproval 호출), 없으면 empty
     * @throws BusinessException(CONFLICT) 잠금 정책 위반
     */
    private Optional<SlipEditRequest> guardLockPolicy(Slip slip, String callerId) {
        SlipStatus s = slip.getStatus();
        // 자유 단계 — 작성자 직접 가능
        if (s == SlipStatus.DRAFT || s == SlipStatus.SAVED || s == SlipStatus.SENT) {
            return Optional.empty();
        }
        // 완전 잠금 단계 — 어떤 채널로도 mutation 불가
        if (SlipEditRequestService.FULLY_LOCKED.contains(s)) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "현 단계 (" + s.getDisplayName() + ") 는 완전 잠금 — 수정/삭제 불가 (사용자 명시 정책)");
        }
        // 종결 단계 — REJECTED/CANCELED 슬립은 mutation 의미 없음
        if (s == SlipStatus.REJECTED || s == SlipStatus.CANCELED) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "현 단계 (" + s.getDisplayName() + ") 는 종결됨 — 수정/삭제 불가");
        }
        // 잠금 단계 — APPROVED 요청 1건 필요
        if (SlipEditRequestService.LOCKED_REQUIRES_APPROVAL.contains(s)) {
            return Optional.of(editRequestService.findActiveApproval(slip.getId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.CONFLICT,
                            "현 단계 (" + s.getDisplayName() + ") 는 창고 인계 후 — 수정/삭제 요청 + 권한자 수락 필요")));
        }
        // 그 외 (COMPLETED 등) — 본 PR 범위 밖, 자유 진행 (향후 정책 확장 여지)
        return Optional.empty();
    }

    private UUID parseActorId(String callerId) {
        if (callerId == null || callerId.isBlank()) {
            return new UUID(0L, 0L);
        }
        try {
            return UUID.fromString(callerId);
        } catch (IllegalArgumentException ex) {
            // X-User-Id 가 UUID 가 아닌 경우 (legacy employeeCode 등) — 가상 system UUID
            return new UUID(0L, 0L);
        }
    }

    /**
     * 버전이력 actorName 안전 변환 — UUID 비공개 가드 ([[uuid-no-user-visibility]],
     * partner-service {@code Partner4TabController.displayNameOrNull} / {@code EstimateService.resolveActorName}
     * 패턴 미러).
     *
     * <p>header 인증 환경에서 {@code callerId} (X-User-Id) 는 계정 UUID 이다. 이를 그대로 actorName 으로
     * capture 하면 버전이력 타임라인(FE 노출 {@code SlipRevisionResponse.actorName})에 raw UUID 가
     * 새어나간다. 따라서:
     * <ol>
     *   <li>{@code callerName} (X-User-Name) 이 있고 UUID 형태가 아니면 그대로 사용한다.</li>
     *   <li>그 외(헤더 부재 / UUID 형태)는 {@code null} 을 반환한다 — 버전이력에 UUID 미노출.</li>
     * </ol>
     *
     * <p>{@code callerId} 폴백을 의도적으로 제거했다 — 폴백하면 다시 UUID 가 actorName 으로 들어간다.
     * {@code callerId} 는 감사용 actorId({@link #parseActorId}) 로만 별도 사용한다.
     *
     * @param callerName X-User-Name 헤더 값 (없으면 null)
     * @param callerId   X-User-Id 헤더 값 (actorId 전용 — actorName 으로는 미사용, 시그니처 명시용)
     * @return UUID 가 아닌 표시명, 또는 {@code null}
     */
    private String resolveActorName(String callerName, String callerId) {
        if (callerName == null || callerName.isBlank()) {
            return null;
        }
        try {
            UUID.fromString(callerName.trim());
            return null; // UUID → 비공개
        } catch (IllegalArgumentException notUuid) {
            return callerName;
        }
    }

    /**
     * 라인 1건 추가 — DRAFT/SAVED 단계만. ProductClient 로 productId 검증 후 추가.
     *
     * @param id 전표 ID
     * @param req 라인 요청
     * @param callerId 호출자 user-id (감사용 — revision actorId)
     * @param callerName 호출자 표시명 (X-User-Name, UUID 비공개 가드 — 버전이력 actorName)
     * @return 갱신된 상세 응답
     * @throws BusinessException(NOT_FOUND) 전표 미발견 또는 productId 미존재
     * @throws BusinessException(CONFLICT) DRAFT/SAVED 가 아닐 때
     */
    public SlipDetailResponse addLine(UUID id, AddLineRequest req, String callerId,
                                      String callerName) {
        Slip slip = loadOrThrow(id);
        slip.requireEditable();
        ProductSummary summary = productClient.requireExists(req.productId());
        // 에픽 후속 #2 — 기존 전표 라인추가도 create 경로와 동일 전개 엔진 사용.
        // BUNDLE(세트)면 product-service expand 로 구성품 N라인(옵션 반영), 아니면 1라인.
        List<PartnerProductPriceMemoryCommand> priceMemoryCommands = new ArrayList<>();
        applyMutation(() -> addSlipLinesExpanded(slip, req.productId(), summary,
                req.productName(), req.modelName(), req.specification(),
                req.quantity(), req.unitPrice(), req.note(), req.setOptions(),
                Boolean.TRUE.equals(req.priceVatInclusive()), req.supplyAmount(), req.vatAmount(),
                req.lineTotalWithVat(), callerId, priceMemoryCommands));
        // 권한 재편 Phase 2.1 — 라인 추가도 헤더+라인 전체 버전이력에 잡히도록 EDIT 스냅샷 캡처
        // [UUID 비공개 가드] actorName 은 X-User-Name 우선, 없거나 UUID 형태면 null
        slipRevisionService.capture(slip, SlipRevisionType.EDIT, null,
                parseActorId(callerId), resolveActorName(callerName, callerId), null);
        priceMemoryService.rememberBatchAfterCommit(priceMemoryCommands, "slip.addLine");
        return SlipDetailResponse.from(slip);
    }

    /**
     * 라인 1건 제거 — DRAFT/SAVED 단계만. orphan removal 로 DB 에서도 제거.
     *
     * @param id 전표 ID
     * @param lineId 제거할 라인 ID
     * @param callerId 호출자 user-id (감사용 — revision actorId)
     * @param callerName 호출자 표시명 (X-User-Name, UUID 비공개 가드 — 버전이력 actorName)
     * @throws BusinessException(NOT_FOUND) 전표/라인 미발견
     * @throws BusinessException(CONFLICT) DRAFT/SAVED 가 아닐 때
     */
    public void removeLine(UUID id, UUID lineId, String callerId, String callerName) {
        Slip slip = loadOrThrow(id);
        slip.requireEditable();
        SlipLine line = slip.getLines().stream()
                .filter(l -> l.getId() != null && l.getId().equals(lineId))
                .findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "라인을 찾을 수 없습니다"));
        applyMutation(() -> slip.removeLine(line));
        // 권한 재편 Phase 2.1 — 라인 삭제도 롤백 가능하도록 EDIT 스냅샷 캡처
        // [UUID 비공개 가드] actorName 은 X-User-Name 우선, 없거나 UUID 형태면 null
        slipRevisionService.capture(slip, SlipRevisionType.EDIT, null,
                parseActorId(callerId), resolveActorName(callerName, callerId), null);
    }

    /** 작성중 → 저장완료. */
    public SlipDetailResponse save(UUID id, String callerId) {
        Slip slip = loadOrThrow(id);
        applyMutation(slip::save);
        return SlipDetailResponse.from(slip);
    }

    /** 저장완료 → 전송완료. */
    public SlipDetailResponse send(UUID id) {
        Slip slip = loadOrThrow(id);
        applyMutation(() -> {
            slip.send();
            if (slip.getSlipType() != SlipType.OUTBOUND) {
                slip.captureRedlineAnchorIfAbsent(maxStoredRevisionNo(slip.getId()));
            }
        });
        return SlipDetailResponse.from(slip);
    }

    /**
     * 수락 — SENT → ACCEPTED. OUTBOUND 면 serial-managed 라인은 인스턴스 FIFO 예약, batch 라인은 기존 수량 예약.
     *
     * @throws BusinessException(CONFLICT) 상태 불일치, 재고 부족, 또는 낙관적 락 충돌
     * @throws BusinessException(INTERNAL_ERROR) inventory-service 호출 실패
     */
    public SlipDetailResponse accept(UUID id, String acceptorUserId) {
        Slip slip = loadOrThrow(id);
        enforceSlipApprovalLine(slip, acceptorUserId, approvalGateForAccept(slip.getSlipType()));
        applyMutation(() -> slip.accept(acceptorUserId));
        if (slip.getSlipType() == SlipType.OUTBOUND) {
            Map<UUID, ProductSummary> productsById = loadProductsByLine(slip);
            Map<UUID, SerialOutboundGroup> serialGroups = serialOutboundGroups(slip, productsById);
            Set<UUID> dispatchedSerialProducts = new HashSet<>();
            // 원격 inventory 예약은 slip 트랜잭션에 묶이지 않으므로(동기 REST), 혼합 전표에서 라인 중간 실패 시
            // 이미 성공한 예약을 역순 보상(release)해 고아 RESERVED 를 방지한다. (D-SER-05 동기 REST + 보상)
            List<Compensation> compensations = new ArrayList<>();
            try {
                for (SlipLine line : slip.getLines()) {
                    ProductSummary product = productsById.get(line.getProductId());
                    if (product.serialManaged()) {
                        if (dispatchedSerialProducts.add(line.getProductId())) {
                            SerialOutboundGroup group = serialGroups.get(line.getProductId());
                            String productCode = product.productCode();
                            inventoryClient.reserveInstances(productCode, slip.getSourceWarehouseId(),
                                    group.quantity(), slip.getSlipNo());
                            compensations.add(new Compensation(productCode, CompensationOperation.RELEASE_INSTANCES,
                                    () -> inventoryClient.releaseInstances(slip.getSlipNo(), productCode)));
                        }
                        continue;
                    }
                    UUID productId = line.getProductId();
                    int quantity = line.getQuantity();
                    inventoryClient.reserve(productId, slip.getSourceWarehouseId(),
                            quantity, SLIP_REF_TYPE, slip.getId());
                    compensations.add(new Compensation(product.productCode(), CompensationOperation.RELEASE,
                            () -> inventoryClient.release(productId, slip.getSourceWarehouseId(),
                                    quantity, SLIP_REF_TYPE, slip.getId())));
                }
            } catch (RuntimeException ex) {
                runCompensationsWithAudit(slip, CompensationPhase.ACCEPT_RESERVE, compensations, ex);
            }
        }
        return SlipDetailResponse.from(slip);
    }

    /** 수락 → 처리중. */
    public SlipDetailResponse process(UUID id) {
        Slip slip = loadOrThrow(id);
        applyMutation(slip::process);
        return SlipDetailResponse.from(slip);
    }

    /**
     * 처리중 → 검수중 — Slice A (sales-polish-2) 신규 단계.
     * 검수자(WAREHOUSE/INSPECTOR/MANAGER/MASTER) 가 picking 결과 검증 시작 시 호출.
     * inspectorUserId/inspectorSignedAt 자동 기입 (도메인 메서드 위임).
     *
     * <p>재고 영향 없음 — OUTBOUND 의 deduct 는 complete 시점에 유지 (검수는 단순 확인 단계).
     *
     * @param id 전표 ID
     * @param inspectorUserId 검수자 user-id (X-User-Id 헤더)
     * @return 갱신된 상세 응답 (status=INSPECTING, inspectorUserId/SignedAt 채워짐)
     * @throws BusinessException(NOT_FOUND) 전표 미발견
     * @throws BusinessException(CONFLICT) 현재 상태가 PROCESSING 이 아닐 때
     */
    public SlipDetailResponse inspect(UUID id, String inspectorUserId) {
        Slip slip = loadOrThrow(id);
        enforceSlipApprovalLine(slip, inspectorUserId, approvalGateForInspect(slip.getSlipType()));
        applyMutation(() -> {
            slip.inspect(inspectorUserId);
            if (slip.getSlipType() == SlipType.OUTBOUND) {
                slip.captureRedlineAnchorIfAbsent(maxStoredRevisionNo(slip.getId()));
            }
        });
        return SlipDetailResponse.from(slip);
    }

    /** S2d-1 — 저장 스냅샷이 아직 없으면 0을 anchor 로 사용한다. */
    private int maxStoredRevisionNo(UUID slipId) {
        Integer maxRevisionNo = slipRevisionRepository.maxRevisionNo(slipId);
        return maxRevisionNo == null ? 0 : maxRevisionNo;
    }

    /**
     * 전표 종류별 결재라인 action 권한을 강제한다.
     *
     * <p>지원하는 전표 종류와 실사용자 UUID에만 적용한다. auth-service 호출 실패 또는 응답 형식 오류는
     * fail-closed 로 처리되며, 이는 기존 JWT / {@code @RequirePermission} 기반 인증·인가 결합과
     * 같은 계층의 결합이다. 별도 가용성 결합을 새로 만들지 않고 이미 모든 사용자 요청이 통과하는
     * auth 경로에 결재라인 판단만 추가한다.
     *
     * <p>{@code system} 호출은 내부 연산 fallback 전용으로 우회한다. 사용자 요청의
     * {@code X-User-Id} 신뢰 경계는 게이트웨이의 identity header strip 단일권위
     * ([[identity-header-authz-antipattern]])에 한정한다.
     */
    private void enforceSlipApprovalLine(
            Slip slip, String actorUserId, SlipApprovalGate gate) {
        if (gate == null || !isRealUser(actorUserId)) {
            return;
        }
        UUID userId = UUID.fromString(actorUserId);
        ApprovalLineAuthorizeResult result = approvalLineAuthorizeClient.authorize(
                gate.documentType(), gate.actionKey(), userId);
        if (result.configured() && !result.allowed()) {
            throw new BusinessException(ErrorCode.FORBIDDEN, gate.forbiddenMessage());
        }
    }

    private SlipApprovalGate approvalGateForAccept(SlipType slipType) {
        return switch (slipType) {
            case OUTBOUND -> new SlipApprovalGate(
                    SLIP_OUTBOUND_DOCUMENT_TYPE,
                    OUTBOUND_DISPATCH_ACTION_KEY,
                    "출고 수락 권한이 없습니다 — 출고자 결재자(그룹/개인)만 처리할 수 있습니다");
            case INBOUND -> new SlipApprovalGate(
                    SLIP_INBOUND_DOCUMENT_TYPE,
                    INBOUND_RECEIVE_ACTION_KEY,
                    "입고 수령 권한이 없습니다 — 입고인 결재자(그룹/개인)만 처리할 수 있습니다");
        };
    }

    private SlipApprovalGate approvalGateForInspect(SlipType slipType) {
        return switch (slipType) {
            case OUTBOUND -> new SlipApprovalGate(
                    SLIP_OUTBOUND_DOCUMENT_TYPE,
                    OUTBOUND_INSPECT_ACTION_KEY,
                    "출고 검수 권한이 없습니다 — 검수자 결재자(그룹/개인)만 처리할 수 있습니다");
            case INBOUND -> new SlipApprovalGate(
                    SLIP_INBOUND_DOCUMENT_TYPE,
                    INBOUND_INSPECT_ACTION_KEY,
                    "입고 검수 권한이 없습니다 — 검수인 결재자(그룹/개인)만 처리할 수 있습니다");
        };
    }

    private record SlipApprovalGate(String documentType, String actionKey, String forbiddenMessage) {
    }

    private boolean isRealUser(String actorUserId) {
        if (actorUserId == null || actorUserId.isBlank() || "system".equals(actorUserId)) {
            return false;
        }
        try {
            UUID.fromString(actorUserId);
            return true;
        } catch (IllegalArgumentException ex) {
            return false;
        }
    }

    /**
     * 처리완료 — PROCESSING → INSPECTING. OUTBOUND 면 serial-managed 라인은 예약 인스턴스 출고, batch 라인은 deduct(fromReservation=true),
     * INBOUND 면 일반 입고는 serial 인스턴스 생성/batch lot 입고, 반품·회차는 serial 회수/batch lot 입고를 호출한다.
     *
     * <p>Slice A (sales-polish-2) 변경: 직전 단계가 PROCESSING → INSPECTING 으로 변경.
     * 재고 차감 시점은 그대로 complete 시점 유지 — 검수는 단순 확인 단계, 재고는
     * 이미 reserve 되어 있고 출고 완료 시점에 deduct 가 의미적으로 정확.
     *
     * @throws BusinessException(CONFLICT) 상태 불일치, 재고 부족, 회수 대상 부족
     * @throws BusinessException(INTERNAL_ERROR) inventory-service 호출 실패
     */
    public SlipDetailResponse complete(UUID id) {
        Slip slip = loadOrThrow(id);
        applyMutation(slip::complete);
        if (slip.getSlipType() == SlipType.OUTBOUND) {
            Map<UUID, ProductSummary> productsById = loadProductsByLine(slip);
            Set<UUID> dispatchedSerialProducts = new HashSet<>();
            for (SlipLine line : slip.getLines()) {
                ProductSummary product = productsById.get(line.getProductId());
                if (product.serialManaged()) {
                    if (dispatchedSerialProducts.add(line.getProductId())) {
                        inventoryClient.shipInstances(slip.getSlipNo(), product.productCode(),
                                slip.getPartnerCode(), null);
                    }
                    continue;
                }
                inventoryClient.deduct(line.getProductId(), slip.getSourceWarehouseId(),
                        line.getQuantity(), true, SLIP_REF_TYPE, slip.getId());
            }
        } else {
            Map<UUID, ProductSummary> productsById = new LinkedHashMap<>();
            Map<UUID, SerialInboundGroup> serialGroups = new LinkedHashMap<>();
            for (SlipLine line : slip.getLines()) {
                ProductSummary product = productClient.requireExists(line.getProductId());
                productsById.put(line.getProductId(), product);
                if (product.serialManaged()) {
                    serialGroups.compute(line.getProductId(), (ignored, group) -> {
                        if (group == null) {
                            return SerialInboundGroup.from(product, line);
                        }
                        group.add(line);
                        return group;
                    });
                }
            }

            if (isRecallInbound(slip)) {
                completeRecallInbound(slip, productsById, serialGroups);
            } else {
                Set<UUID> dispatchedSerialProducts = new HashSet<>();
                for (SlipLine line : slip.getLines()) {
                    ProductSummary product = productsById.get(line.getProductId());
                    if (!product.serialManaged()) {
                        inboundBatchLine(slip, line);
                        continue;
                    }
                    if (dispatchedSerialProducts.add(line.getProductId())) {
                        SerialInboundGroup group = serialGroups.get(line.getProductId());
                        inventoryClient.inboundInstances(line.getProductId(), product.productCode(),
                                slip.getDestinationWarehouseId(), group.quantity(),
                                resolveInboundType(slip), slip.getSlipNo(), group.weightedUnitCost());
                    }
                }
            }
        }
        return SlipDetailResponse.from(slip);
    }

    private String resolveInboundType(Slip slip) {
        DeliveryTag tag = slip.getDeliveryTag();
        if (tag == DeliveryTag.BORROW) {
            return "차용";
        }
        return "구매";
    }

    /** 저장된 전표 라인만 line UUID를 멱등 키로 전달하고 legacy 호출은 기존 계약을 유지한다. */
    private void inboundBatchLine(Slip slip, SlipLine line) {
        if (line.getId() == null) {
            inventoryClient.inbound(line.getProductId(), slip.getDestinationWarehouseId(),
                    line.getQuantity(), slip.getSlipNo(), inboundUnitCost(line));
            return;
        }
        inventoryClient.inbound(line.getProductId(), slip.getDestinationWarehouseId(),
                line.getQuantity(), slip.getSlipNo(), line.getId(), inboundUnitCost(line));
    }

    private boolean isRecallInbound(Slip slip) {
        DeliveryTag tag = slip.getDeliveryTag();
        return tag == DeliveryTag.RETURN || tag == DeliveryTag.RETURN_TRIP;
    }

    private void completeRecallInbound(Slip slip, Map<UUID, ProductSummary> productsById,
                                       Map<UUID, SerialInboundGroup> serialGroups) {
        if (!serialGroups.isEmpty() && (slip.getPartnerCode() == null || slip.getPartnerCode().isBlank())) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "회수 입고는 출고 거래처 코드가 필요합니다. slipNo=" + slip.getSlipNo());
        }

        Set<UUID> dispatchedSerialProducts = new HashSet<>();
        List<Compensation> compensations = new ArrayList<>();
        try {
            for (SlipLine line : slip.getLines()) {
                ProductSummary product = productsById.get(line.getProductId());
                if (product.serialManaged() && dispatchedSerialProducts.add(line.getProductId())) {
                    SerialInboundGroup group = serialGroups.get(line.getProductId());
                    String productCode = product.productCode();
                    inventoryClient.recallInstances(slip.getPartnerCode(), productCode,
                            group.quantity(), slip.getSlipNo());
                    compensations.add(new Compensation(productCode, CompensationOperation.UNRECALL_INSTANCES,
                            () -> inventoryClient.unrecallInstances(slip.getSlipNo(), productCode)));
                }
            }

            // batch 품목은 기존 lot 입고 경로를 유지한다. 원격 batch inbound 는 현재 inverse API 가 없으므로
            // serial 회수 성공 뒤 실행해 "batch lot 생성 후 serial 회수 실패" 상태를 만들지 않는다.
            for (SlipLine line : slip.getLines()) {
                ProductSummary product = productsById.get(line.getProductId());
                if (!product.serialManaged()) {
                    inboundBatchLine(slip, line);
                }
            }
        } catch (RuntimeException ex) {
            runCompensationsWithAudit(slip, CompensationPhase.COMPLETE_RECALL, compensations, ex);
        }
    }

    private void runCompensationsWithAudit(Slip slip, CompensationPhase phase,
                                           List<Compensation> compensations,
                                           RuntimeException originalEx) {
        for (int i = compensations.size() - 1; i >= 0; i--) {
            Compensation compensation = compensations.get(i);
            try {
                compensation.action().run();
            } catch (RuntimeException compensationFailure) {
                try {
                    compensationAuditWriter.record(slip, phase, compensation.productCode(),
                            compensation.operation(), compensationFailure, originalEx);
                } catch (RuntimeException auditFailure) {
                    compensationFailure.addSuppressed(auditFailure);
                }
                originalEx.addSuppressed(compensationFailure);
            }
        }
        throw originalEx;
    }

    private record Compensation(String productCode, CompensationOperation operation, Runnable action) {
    }

    private Map<UUID, ProductSummary> loadProductsByLine(Slip slip) {
        Map<UUID, ProductSummary> productsById = new HashMap<>();
        for (SlipLine line : slip.getLines()) {
            productsById.computeIfAbsent(line.getProductId(), productClient::requireExists);
        }
        return productsById;
    }

    private Map<UUID, SerialOutboundGroup> serialOutboundGroups(
            Slip slip, Map<UUID, ProductSummary> productsById) {
        Map<UUID, SerialOutboundGroup> groups = new LinkedHashMap<>();
        for (SlipLine line : slip.getLines()) {
            ProductSummary product = productsById.get(line.getProductId());
            if (product.serialManaged()) {
                groups.compute(line.getProductId(), (ignored, group) -> {
                    if (group == null) {
                        return SerialOutboundGroup.from(product, line);
                    }
                    group.add(line);
                    return group;
                });
            }
        }
        return groups;
    }

    private static final class SerialOutboundGroup {
        private int quantity;

        private static SerialOutboundGroup from(ProductSummary product, SlipLine line) {
            SerialOutboundGroup group = new SerialOutboundGroup();
            group.add(line);
            return group;
        }

        private void add(SlipLine line) {
            quantity += line.getQuantity();
        }

        private int quantity() {
            return quantity;
        }
    }

    private static final class SerialInboundGroup {
        private final ProductSummary product;
        private int quantity;
        private BigDecimal totalCost;

        private SerialInboundGroup(ProductSummary product) {
            this.product = product;
        }

        private static SerialInboundGroup from(ProductSummary product, SlipLine line) {
            SerialInboundGroup group = new SerialInboundGroup(product);
            group.add(line);
            return group;
        }

        private void add(SlipLine line) {
            quantity += line.getQuantity();
            BigDecimal unitCost = inboundUnitCost(line);
            if (unitCost != null) {
                BigDecimal lineCost = unitCost.multiply(BigDecimal.valueOf(line.getQuantity()));
                totalCost = totalCost == null ? lineCost : totalCost.add(lineCost);
            }
        }

        private int quantity() {
            return quantity;
        }

        private BigDecimal weightedUnitCost() {
            if (totalCost == null || quantity == 0) {
                return product.sellingPrice();
            }
            return totalCost.divide(BigDecimal.valueOf(quantity), 2, RoundingMode.HALF_UP);
        }
    }

    /**
     * 입고 원가를 공급가액 기준으로 정규화한다.
     * 정상 라인은 supplyAmount가 unitPrice×quantity라 기존 원가가 유지되고, 권위 금액 라인은
     * 화면 입력 단가가 VAT 포함일 수 있으므로 공급가액/수량으로 VAT를 제외한다. 공급가액이
     * 없는 legacy 라인은 기존 unitPrice를 그대로 사용한다.
     */
    private static BigDecimal inboundUnitCost(SlipLine line) {
        if (line.getSupplyAmount() != null && line.getQuantity() > 0) {
            return line.getSupplyAmount()
                    .divide(BigDecimal.valueOf(line.getQuantity()), 2, RoundingMode.HALF_UP);
        }
        return line.getUnitPrice();
    }

    /** 처리완료 → 배송중 (OUTBOUND 한정). */
    public SlipDetailResponse ship(UUID id) {
        Slip slip = loadOrThrow(id);
        applyMutation(slip::ship);
        return SlipDetailResponse.from(slip);
    }

    /** 배송중 → 배송완료 (OUTBOUND 한정). */
    public SlipDetailResponse deliver(UUID id) {
        Slip slip = loadOrThrow(id);
        applyMutation(slip::deliver);
        return SlipDetailResponse.from(slip);
    }

    /** 확정 — 출고는 DELIVERED→CONFIRMED, 입고는 COMPLETED→CONFIRMED. */
    public SlipDetailResponse confirm(UUID id, String callerId) {
        Slip slip = loadOrThrow(id);
        applyMutation(slip::confirm);
        return SlipDetailResponse.from(slip);
    }

    /**
     * 반려 — SENT/ACCEPTED → REJECTED. 직전 상태가 ACCEPTED 였고 OUTBOUND 면 inventory release.
     *
     * @param id 전표 ID
     * @param callerId 호출자 user-id (감사용 — revision actorId)
     * @param callerName 호출자 표시명 (X-User-Name, UUID 비공개 가드 — 버전이력 actorName)
     * @param reasonText 반려 사유 (memo 앞에 prepend)
     * @return 갱신된 상세 응답
     * @throws BusinessException(NOT_FOUND) 전표 미발견
     * @throws BusinessException(CONFLICT) 현재 상태가 SENT/ACCEPTED 둘 다 아닐 때
     * @throws BusinessException(INTERNAL_ERROR) inventory release 호출 실패
     */
    public SlipDetailResponse reject(UUID id, String callerId, String callerName, String reasonText) {
        Slip slip = loadOrThrow(id);
        SlipStatus previous = slip.getStatus();
        // 권한 재편 Phase 2.1 — 반려 사유 prepend 로 memo(toSnapshot 필드) 변경 여부 감지용 사전 snapshot
        String oldMemo = slip.getMemo();
        applyMutation(() -> slip.reject(reasonText));
        if (previous == SlipStatus.ACCEPTED && slip.getSlipType() == SlipType.OUTBOUND) {
            Map<UUID, ProductSummary> productsById = loadProductsByLine(slip);
            Set<UUID> dispatchedSerialProducts = new HashSet<>();
            for (SlipLine line : slip.getLines()) {
                ProductSummary product = productsById.get(line.getProductId());
                if (product.serialManaged()) {
                    if (dispatchedSerialProducts.add(line.getProductId())) {
                        inventoryClient.releaseInstances(slip.getSlipNo(), product.productCode());
                    }
                    continue;
                }
                inventoryClient.release(line.getProductId(), slip.getSourceWarehouseId(),
                        line.getQuantity(), SLIP_REF_TYPE, slip.getId());
            }
        }
        // 권한 재편 Phase 2.1 — reasonText 가 memo 앞에 prepend 되어 실제 변경된 경우에만 EDIT 캡처
        // (상태전이 reject 자체는 content 아님 — memo 변경분만 content-mutation 으로 본다)
        if (!java.util.Objects.equals(oldMemo, slip.getMemo())) {
            // [UUID 비공개 가드] actorName 은 X-User-Name 우선, 없거나 UUID 형태면 null
            slipRevisionService.capture(slip, SlipRevisionType.EDIT, null,
                    parseActorId(callerId), resolveActorName(callerName, callerId), null);
        }
        return SlipDetailResponse.from(slip);
    }

    /**
     * 취소 — DRAFT/SAVED/SENT → CANCELED. ACCEPTED 단계는 cancel 불가 (도메인 가드 — 현 슬라이스 정책).
     * 단, 이전 spec 명시 "release if ACCEPTED" 를 지키기 위해 reject 와 동일한 release 분기 포함하지만,
     * 도메인이 ACCEPTED 단계 cancel 을 거부하므로 사실상 reject 경로로만 release 트리거됨.
     *
     * @param id 전표 ID
     * @param callerId 호출자 user-id
     * @return 갱신된 상세 응답
     * @throws BusinessException(NOT_FOUND) 전표 미발견
     * @throws BusinessException(CONFLICT) 현재 상태가 취소 가능 단계 밖일 때
     */
    public SlipDetailResponse cancel(UUID id, String callerId) {
        Slip slip = loadOrThrow(id);
        SlipStatus previous = slip.getStatus();
        applyMutation(slip::cancel);
        if (previous == SlipStatus.ACCEPTED && slip.getSlipType() == SlipType.OUTBOUND) {
            Map<UUID, ProductSummary> productsById = loadProductsByLine(slip);
            Set<UUID> dispatchedSerialProducts = new HashSet<>();
            for (SlipLine line : slip.getLines()) {
                ProductSummary product = productsById.get(line.getProductId());
                if (product.serialManaged()) {
                    if (dispatchedSerialProducts.add(line.getProductId())) {
                        inventoryClient.releaseInstances(slip.getSlipNo(), product.productCode());
                    }
                    continue;
                }
                inventoryClient.release(line.getProductId(), slip.getSourceWarehouseId(),
                        line.getQuantity(), SLIP_REF_TYPE, slip.getId());
            }
        }
        return SlipDetailResponse.from(slip);
    }

    /**
     * 단건 조회 — 라인 포함 상세.
     *
     * <p>SP-08-5-5/S4D: user-service internal lookup 으로 {@code ownerFullName} 과
     * 결재 서명자 성명({@code dispatcherFullName/inspectorFullName/acceptedByFullName})을 채운다.
     * user-service 호출 실패 시 graceful fallback — 각 이름 null 로 응답 정상 반환.
     * userId 파싱 실패(UUID 형식 오류) 시에도 fallback.
     *
     * @param id 전표 ID
     * @return 상세 응답 (ownerFullName 포함)
     * @throws BusinessException(NOT_FOUND) 전표 미발견
     */
    @Transactional(readOnly = true)
    public SlipDetailResponse getOne(UUID id) {
        Slip slip = loadOrThrow(id);
        boolean outbound = slip.getSlipType() == SlipType.OUTBOUND;
        String ownerFullName = resolveOwnerFullName(slip.getCreatedBy());
        // 서명자 이름은 slipType 별 의미 있는 역할만 resolve 한다 (응답 계약 정직성 + 중복 호출 회피).
        // accept() 가 slipType 무관하게 acceptedBy==dispatcherUserId 동일 설정(Slip.java) 하므로,
        // 출고자(dispatcher)=OUTBOUND 만 / 입고자(acceptedBy)=INBOUND 만 / 검수자(inspector)=양쪽 으로 분기.
        String dispatcherFullName = outbound ? resolveUserFullName(slip.getDispatcherUserId()) : null;
        String acceptedByFullName = outbound ? null : resolveUserFullName(slip.getAcceptedBy());
        String inspectorFullName = resolveUserFullName(slip.getInspectorUserId());
        return SlipDetailResponse.from(slip, ownerFullName, dispatcherFullName,
                inspectorFullName, acceptedByFullName);
    }

    /**
     * 페이지 조회 — slipType, status 필터 (둘 다 null 이면 전체).
     *
     * <p>PR-E1 BE-A0 (PR #117) 호환 — 기존 2 param + 신규 5 query param overload 가
     * 본 2 param 메서드 위임. FE/Feign 호환 가드.
     *
     * @param slipType 필터 (null 가능)
     * @param status 필터 (null 가능)
     * @param pageable 페이지 정보
     * @return 요약 응답 페이지
     */
    @Transactional(readOnly = true)
    public Page<SlipResponse> list(SlipType slipType, SlipStatus status, Pageable pageable) {
        return list(slipType, status, null, null, null, null, null, null, false, pageable);
    }

    /**
     * 전표번호 또는 거래처명 키워드 자동완성.
     *
     * <p>그룹웨어 결재 첨부에서 실제 전표를 선택하도록 돕는다. 검색어는 trim 후 전표번호 또는
     * 거래처명 대소문자 무시 부분일치로 조회하며, 빈 검색어는 DB 조회 없이 빈 목록을 반환한다.
     * limit 은 기본 10, 최대 20 으로 제한한다.
     *
     * @param q 전표번호 또는 거래처명 키워드
     * @param limit 요청 limit (null/0 이하이면 10, 최대 20)
     * @return UUID 없는 전표 검색 결과
     */
    @Transactional(readOnly = true)
    public List<SlipSearchResult> searchBySlipNo(String q, int limit) {
        String normalized = q == null ? "" : q.trim();
        if (normalized.isEmpty()) {
            return List.of();
        }
        int effectiveLimit = Math.min(Math.max(limit, 1), 20);
        return slipRepository.searchByKeywordAndSlipTypeIn(
                        normalized, List.of(SlipType.values()), PageRequest.of(0, effectiveLimit))
                .stream()
                .map(SlipSearchResult::from)
                .toList();
    }

    /**
     * 전표번호 또는 거래처명 키워드 자동완성 — 호출자 권한의 전표유형 범위 안에서만 조회한다.
     *
     * @param q 전표번호 또는 거래처명 키워드
     * @param limit 요청 limit (null/0 이하이면 10, 최대 20)
     * @param slipTypes 조회 허용 전표유형 목록
     * @return UUID 없는 전표 검색 결과
     */
    @Transactional(readOnly = true)
    public List<SlipSearchResult> searchBySlipNo(String q, int limit, Collection<SlipType> slipTypes) {
        String normalized = q == null ? "" : q.trim();
        if (normalized.isEmpty() || slipTypes == null || slipTypes.isEmpty()) {
            return List.of();
        }
        int effectiveLimit = Math.min(Math.max(limit, 1), 20);
        return slipRepository.searchByKeywordAndSlipTypeIn(
                        normalized, List.copyOf(slipTypes), PageRequest.of(0, effectiveLimit))
                .stream()
                .map(SlipSearchResult::from)
                .toList();
    }

    /**
     * 페이지 조회 (PR-E1 BE-A0 확장 — 7 param 동적 필터). 모든 param null 이면 전체 활성 슬립 페이지.
     *
     * <p>{@link Specification} 기반 동적 query — 인자가 비어있지 않은 조건만 AND 결합.
     * 기존 named query (findAllBySlipTypeAndStatusAndIsDeletedFalse 등) 는 보존 — Slice B / lock-by-period
     * 등 다른 호출자 회귀 가드.
     *
     * <p>지원 필터:
     * <ul>
     *   <li>{@code slipType} (정확 일치)</li>
     *   <li>{@code status} (정확 일치)</li>
     *   <li>{@code from} ~ {@code to} 날짜 범위 (slip_date BETWEEN, 둘 다 또는 한쪽만 가능)</li>
     *   <li>{@code partnerCode} 정확 일치 (V15 신규 컬럼)</li>
     *   <li>{@code driverPhone} like 매칭 ({@code %phone%})</li>
     *   <li>{@code regionGroup} 정확 일치 (V15 신규 컬럼)</li>
     * </ul>
     *
     * <p>is_deleted=false 자동 (entity {@link org.hibernate.annotations.SQLRestriction} 가 적용).
     * 단, JPA Criteria 는 SQLRestriction 을 자동 적용하지 못하는 경우가 있어 명시 predicate 추가.
     *
     * @return 요약 응답 페이지
     */
    @Transactional(readOnly = true)
    public Page<SlipResponse> list(SlipType slipType, SlipStatus status,
                                   LocalDate from, LocalDate to,
                                   String partnerCode, String driverPhone,
                                   String regionGroup, Pageable pageable) {
        return list(slipType, status, from, to, partnerCode, driverPhone, regionGroup, null, false, pageable);
    }

    /**
     * 페이지 조회 (deliveryTag 멀티셀렉 포함 — 최종 8+1 param 동적 필터).
     *
     * <p>{@code deliveryTags} 가 지정된 경우 {@code slipType} 과 정합을 검증한다.
     * OUTBOUND 전용 태그를 slipType=INBOUND 와 함께 요청하거나, INBOUND 전용 태그를
     * slipType=OUTBOUND 와 함께 요청하면 {@code 400 BAD_REQUEST} 를 반환한다.
     *
     * <p>정합 검증은 {@code slipType != null && deliveryTags != null && !deliveryTags.isEmpty()} 일 때만 수행.
     *
     * @param slipType 필터 (null 가능)
     * @param status 필터 (null 가능)
     * @param from 시작 날짜 (null 가능)
     * @param to 종료 날짜 (null 가능)
     * @param partnerCode 거래처 코드 (null 가능)
     * @param driverPhone 기사 전화 (null 가능, like 매칭)
     * @param regionGroup 지역 그룹 (null 가능)
     * @param deliveryTags 배송 태그 목록 (null/empty 이면 무시). slipType 정합 불일치 시 400.
     * @param pageable 페이지 정보
     * @return 요약 응답 페이지
     * @throws BusinessException(INVALID_INPUT) slipType-deliveryTag 정합 불일치
     */
    @Transactional(readOnly = true)
    public Page<SlipResponse> list(SlipType slipType, SlipStatus status,
                                   LocalDate from, LocalDate to,
                                   String partnerCode, String driverPhone,
                                   String regionGroup,
                                   java.util.List<DeliveryTag> deliveryTags,
                                   boolean includeDeleted,
                                   Pageable pageable) {
        // slipType-deliveryTag 정합 가드
        if (slipType != null && deliveryTags != null && !deliveryTags.isEmpty()) {
            for (DeliveryTag tag : deliveryTags) {
                if (tag.getDirection() != slipType) {
                    throw new BusinessException(ErrorCode.INVALID_INPUT,
                            "'" + tag.getKoreanLabel() + "' 배송 태그는 "
                                    + slipType.getDisplayName() + "와 정합되지 않습니다.");
                }
            }
        }
        String normalizedRegionGroup = normalizeListFilter(regionGroup);
        if (normalizedRegionGroup != null) {
            Specification<Slip> spec = buildListSpec(slipType, status, from, to,
                    partnerCode, driverPhone, normalizedRegionGroup, deliveryTags);
            return slipRepository.findAll(spec, pageable).map(SlipResponse::from);
        }

        List<String> deliveryTagNames = deliveryTags == null || deliveryTags.isEmpty()
                ? List.of("__NONE__")
                : deliveryTags.stream().map(Enum::name).toList();
        Pageable nativePageable = pageable == null
                ? PageRequest.of(0, 20)
                : PageRequest.of(pageable.getPageNumber(), pageable.getPageSize());
        return slipRepository.listIncludingDeleted(
                includeDeleted,
                slipType == null ? null : slipType.name(),
                status == null ? null : status.name(),
                from,
                to,
                normalizeListFilter(partnerCode),
                normalizeListFilter(driverPhone),
                deliveryTagNames,
                deliveryTags == null || deliveryTags.isEmpty(),
                nativePageable).map(SlipResponse::from);
    }

    private static String normalizeListFilter(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    /**
     * #809 가격기억 저장 단가 정규화.
     *
     * <p>store basis 는 전표/견적 화면 입력 필드와 동일한 VAT 포함 단가다. 입력이 공급단가로
     * 들어온 legacy/null priceVatInclusive 경로는 라인의 {@code unitPriceWithVat} 계산과 동일하게
     * 1.1 배로 정규화한다.
     */
    private void collectPriceMemory(List<PartnerProductPriceMemoryCommand> commands,
                                    UUID partnerId, UUID productId, BigDecimal unitPrice,
                                    boolean priceVatInclusive, String source, String actor) {
        if (partnerId == null || productId == null || unitPrice == null) {
            return;
        }
        BigDecimal vatInclusiveUnitPrice = priceVatInclusive
                ? unitPrice
                : unitPrice.multiply(new BigDecimal("1.1")).setScale(2, RoundingMode.HALF_UP);
        commands.add(new PartnerProductPriceMemoryCommand(
                partnerId, productId, vatInclusiveUnitPrice, source, actor));
    }

    /**
     * 동적 Specification 빌더 — deliveryTags IN 필터 포함.
     *
     * <p>deliveryTags 가 null/empty 이면 IN 조건 미적용 (전체 태그 포함).
     * cleanup / next-day-image 등 다른 service 가 빌더 재사용 시 확장 여지 보존.
     */
    private Specification<Slip> buildListSpec(SlipType slipType, SlipStatus status,
                                              LocalDate from, LocalDate to,
                                              String partnerCode, String driverPhone,
                                              String regionGroup,
                                              java.util.List<DeliveryTag> deliveryTags) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            // SQLRestriction 보강 — Criteria query 에서도 명시 가드
            predicates.add(cb.isFalse(root.get("isDeleted")));
            if (slipType != null) {
                predicates.add(cb.equal(root.get("slipType"), slipType));
            }
            if (status != null) {
                predicates.add(cb.equal(root.get("status"), status));
            }
            if (from != null && to != null) {
                predicates.add(cb.between(root.get("slipDate"), from, to));
            } else if (from != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("slipDate"), from));
            } else if (to != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("slipDate"), to));
            }
            if (partnerCode != null && !partnerCode.isBlank()) {
                predicates.add(cb.equal(root.get("partnerCode"), partnerCode.trim()));
            }
            if (driverPhone != null && !driverPhone.isBlank()) {
                predicates.add(cb.like(root.get("driverPhone"), "%" + driverPhone.trim() + "%"));
            }
            if (regionGroup != null && !regionGroup.isBlank()) {
                predicates.add(cb.equal(root.get("classifiedRegionGroup"), regionGroup.trim()));
            }
            if (deliveryTags != null && !deliveryTags.isEmpty()) {
                predicates.add(root.get("deliveryTag").in(deliveryTags));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    /**
     * 기간 마감 lock — accounting-service Feign 호출용 (P1-8 Stage 4 신규).
     *
     * <p>기간(startDate~endDate, 포함) 내 지정 status 의 slip 중 lock_flag=false 인 슬립을
     * 일괄 lock_flag=true 로 update. 이미 lock 된 슬립은 자동 제외 (idempotent).
     *
     * <p>일반적으로 status=CONFIRMED 호출 — 회계 마감 후 매출 정정 차단.
     *
     * @param startDate 기간 시작일 (포함)
     * @param endDate 기간 종료일 (포함)
     * @param status 대상 상태 (default CONFIRMED — service 호출자 책임)
     * @return lock 된 슬립 건수
     */
    public int lockByPeriod(LocalDate startDate, LocalDate endDate, SlipStatus status) {
        if (startDate == null || endDate == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "startDate/endDate 는 필수입니다");
        }
        if (status == null) {
            status = SlipStatus.CONFIRMED;
        }
        List<Slip> targets = slipRepository
                .findAllBySlipDateBetweenAndStatusAndLockFlagFalseAndIsDeletedFalse(
                        startDate, endDate, status);
        for (Slip slip : targets) {
            slip.lock();
        }
        return targets.size();
    }

    /**
     * partnerId → 사업자등록번호 resolve — partner-service Feign 호출.
     *
     * <p>Feign fail (5xx / 연결 실패 / 토큰 미설정) 시 null 반환 (legacy 호환, businessNumber NULL 유지).
     * 정상 응답 시 사업자등록번호 문자열 반환.
     *
     * @param partnerId 거래처 UUID (null 이면 null 반환)
     * @return 사업자등록번호 문자열, 실패 시 null
     */
    private String resolveBusinessNumber(UUID partnerId) {
        if (partnerId == null) {
            return null;
        }
        return partnerInternalClient.resolveBusinessNumber(partnerId).orElse(null);
    }

    /**
     * createdBy (UUID 문자열) → 담당자 성명 resolve — 기존 SP-08-5-5 호출 의미 보존.
     *
     * @param createdBy BaseEntity.createdBy (UUID 문자열 또는 null)
     * @return 담당자 성명, 실패 시 null
     */
    private String resolveOwnerFullName(String createdBy) {
        return resolveUserFullName(createdBy);
    }

    /**
     * userId 문자열 → 사용자 성명 resolve — user-service internal lookup.
     *
     * <p>SP-08-5-5/S4D. {@code userId} 가 UUID 형식이 아니거나 null 이면 null 반환.
     * user-service 호출 실패 시 null 반환 (graceful fallback).
     *
     * @param userId 사용자 UUID 문자열 또는 null
     * @return 사용자 성명, 실패 시 null
     */
    private String resolveUserFullName(String userId) {
        if (userId == null || userId.isBlank()) {
            return null;
        }
        try {
            UUID parsedUserId = UUID.fromString(userId);
            return userInternalClient.resolveFullName(parsedUserId).orElse(null);
        } catch (Exception ex) {
            // userId 가 UUID 형식이 아니거나(예: "system") client 가 예외를 전파해도
            // 상세 조회(getOne)는 정상 반환해야 하므로 graceful fallback — 이름 null.
            return null;
        }
    }

    private Slip loadOrThrow(UUID id) {
        return slipRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "전표를 찾을 수 없습니다"));
    }

    private Slip loadOrThrowForCollabUpdate(UUID id) {
        return slipRepository.findByIdForCollabUpdate(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "전표를 찾을 수 없습니다"));
    }

    /**
     * 도메인 mutation 실행 — IllegalState/IllegalArgument 를 BusinessException 으로 매핑하고
     * OptimisticLock 충돌은 그대로 CONFLICT 로 변환.
     */
    private void applyMutation(Runnable mutation) {
        try {
            mutation.run();
        } catch (BusinessException ex) {
            throw ex;
        } catch (OptimisticLockException | OptimisticLockingFailureException ex) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "전표 동시 수정 충돌 — 새로고침 후 재시도하세요");
        } catch (IllegalStateException ex) {
            throw new BusinessException(ErrorCode.CONFLICT, ex.getMessage());
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, ex.getMessage());
        }
    }
}
