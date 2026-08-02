package com.samhanair.logis.slip.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.delivery.domain.DeliveryBatch;
import com.samhanair.logis.slip.delivery.repository.DeliveryBatchRepository;
import com.samhanair.logis.slip.delivery.web.dto.PublicSignatureRequest;
import com.samhanair.logis.slip.delivery.web.dto.PublicSignatureResponse;
import com.samhanair.logis.slip.delivery.web.dto.PublicSignatureViewResponse;
import com.samhanair.logis.slip.domain.SignatureChannel;
import com.samhanair.logis.slip.domain.SignatureSource;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.web.dto.SlipDisplayAmount;
import com.samhanair.logis.slip.domain.SlipSignatureAudit;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.repository.SlipSignatureAuditRepository;
import com.samhanair.logis.slip.web.dto.AdminSignatureResponse;
import com.samhanair.logis.slip.web.dto.InternalSignatureRegistrationRequest;
import com.samhanair.logis.slip.web.dto.InternalSignatureResponse;
import jakarta.persistence.OptimisticLockException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 인수자 전자서명 워크플로우 — Slice C (signature-slice-C Plan §1.3 + §2).
 *
 * <p>endpoint 4종 처리:
 * <ul>
 *   <li>{@link #recordSignature} — 공개 모바일 POST {@code /public/batches/.../signature}</li>
 *   <li>{@link #findByShareToken} — 공개 인수자 view GET {@code /public/signatures/{shareToken}}</li>
 *   <li>{@link #getSignature} — 관리자 GET {@code /api/slips/{id}/signature}</li>
 *   <li>{@link #invalidateSignature} — 관리자 DELETE {@code /api/slips/{id}/signature}</li>
 * </ul>
 *
 * <p>핵심 검증 (Plan §5):
 * <ol>
 *   <li>PNG bytes 의 SHA-256 hex 재계산 → 클라이언트 hash mismatch 시 INVALID_INPUT (400)</li>
 *   <li>PNG 크기 ≤ {@value #PNG_MAX_BYTES} bytes 가드 (50KB)</li>
 *   <li>signerName 1~50자 (DTO @Size 가 1차, 도메인이 2차 가드)</li>
 *   <li>토큰/슬립 미발견 — NOT_FOUND (404, 정보 노출 X)</li>
 *   <li>share token 만료 — Controller 에서 410 GONE 매핑 (CONFLICT 던짐)</li>
 * </ol>
 *
 * <p>audit 적재: 도메인 mutation 직후 같은 트랜잭션에서 INSERT — RECORD/INVALIDATE 2종.
 * 공개 endpoint RECORD 시 actorUserId=NULL (인증 없음), 관리자 INVALIDATE 시 X-User-Id 보존.
 */
@Service
@Transactional
@RequiredArgsConstructor
public class SlipSignatureService {

    /** PNG 크기 가드 — 50KB (Plan §5). */
    public static final int PNG_MAX_BYTES = 50 * 1024;

    private final SlipRepository slipRepository;
    private final DeliveryBatchRepository batchRepository;
    private final SlipSignatureAuditRepository auditRepository;
    private final PartnerInternalClient partnerInternalClient;

    /**
     * 공개 모바일 서명 등록 — Plan §2 의 4 endpoint 중 1번.
     *
     * <p>처리 순서:
     * <ol>
     *   <li>batch token 검증 + 만료 검증 (만료 시 CONFLICT → Controller 410)</li>
     *   <li>해당 batch + slipNo 슬립 lookup (없으면 NOT_FOUND)</li>
     *   <li>PNG base64 디코드 + 크기 가드 (50KB) + 서버 SHA-256 재계산 + clientHash 비교</li>
     *   <li>{@link Slip#recordSignature} 호출 — INSPECTING/COMPLETED/SHIPPING 가드</li>
     *   <li>{@link SlipSignatureAudit#record} INSERT</li>
     *   <li>응답: signedAt + shareToken + 만료 시각</li>
     * </ol>
     *
     * @param batchToken delivery batch token (base64url 64자)
     * @param slipNo 전표번호 ({@code 2026/05/05-1} 또는 {@code 2026-05-05-1} slug 형식 모두 허용)
     * @param req 요청 body
     * @return 서명 결과 (shareToken 포함)
     * @throws BusinessException(NOT_FOUND) 토큰/슬립 미발견
     * @throws BusinessException(CONFLICT) batch token 만료, slip 단계 미충족
     * @throws BusinessException(INVALID_INPUT) PNG 50KB 초과, hash mismatch
     */
    public PublicSignatureResponse recordSignature(String batchToken, String slipNo,
                                                   PublicSignatureRequest req) {
        // 1. batch token 검증
        DeliveryBatch batch = batchRepository.findByBatchToken(batchToken)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "유효하지 않은 토큰입니다"));
        if (batch.isExpired()) {
            throw new BusinessException(ErrorCode.CONFLICT, "토큰이 만료되었습니다");
        }

        // 2. slip lookup (slipNo slug 양쪽 형식 허용 — design mobile-spec.md §1.1)
        String canonicalSlipNo = canonicalSlipNo(slipNo);
        Slip slip = findBatchSlip(batch.getId(), canonicalSlipNo)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "슬립을 찾을 수 없습니다"));

        // 3. PNG 디코드 + 50KB 가드 + 서버 hash 재계산
        byte[] png = decodePng(req.signaturePngBase64());
        if (png.length > PNG_MAX_BYTES) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "서명 PNG 가 너무 큽니다 (" + png.length + " bytes, 최대 " + PNG_MAX_BYTES + ")");
        }
        String serverHash = sha256Hex(png);
        if (!serverHash.equalsIgnoreCase(req.clientHash())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "서명 무결성 검증 실패 — 클라이언트 hash 가 일치하지 않습니다");
        }

        // 4. 도메인 메서드 위임 (단계 가드 + 5필드 갱신 + share token 발급)
        // W10-4: 공개 모바일 endpoint = LINK source (SMS/Aligo 발급 링크).
        applyMutation(() -> slip.recordSignature(req.signerName(), png, serverHash,
                SignatureChannel.MOBILE_CANVAS, SignatureSource.LINK));

        // 5. audit 적재 — actorUserId=NULL (공개 endpoint, 인증 없음), source=LINK
        auditRepository.save(SlipSignatureAudit.record(slip.getId(),
                slip.getSignerName(), slip.getSignatureHash(), SignatureSource.LINK));

        // 6. 응답
        return new PublicSignatureResponse(
                slip.getSignedAt(),
                slip.getSignatureShareToken(),
                slip.getSignatureShareExpiresAt(),
                slip.getSignatureHash());
    }

    /**
     * 배송기사 서명 기록 — Slice C2 (PR #23 follow-up).
     * 인수자 서명({@link #recordSignature})과 동일 패턴, 차이: signerName 입력 X (Slip.driverName 재사용),
     * share token 발급 X (인수자 share 토큰을 그대로 재사용).
     *
     * @param batchToken delivery batch token
     * @param slipNo 전표번호 ({@code 2026/05/05-1} 또는 {@code 2026-05-05-1} slug 형식 모두 허용)
     * @param req 요청 body
     * @return 기사 서명 결과
     */
    public com.samhanair.logis.slip.delivery.web.dto.PublicDriverSignatureResponse recordDriverSignature(
            String batchToken, String slipNo,
            com.samhanair.logis.slip.delivery.web.dto.PublicDriverSignatureRequest req) {
        DeliveryBatch batch = batchRepository.findByBatchToken(batchToken)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "유효하지 않은 토큰입니다"));
        if (batch.isExpired()) {
            throw new BusinessException(ErrorCode.CONFLICT, "토큰이 만료되었습니다");
        }
        String canonicalSlipNo = canonicalSlipNo(slipNo);
        Slip slip = findBatchSlip(batch.getId(), canonicalSlipNo)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "슬립을 찾을 수 없습니다"));

        byte[] png = decodePng(req.signaturePngBase64());
        if (png.length > PNG_MAX_BYTES) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "기사 서명 PNG 가 너무 큽니다 (" + png.length + " bytes, 최대 " + PNG_MAX_BYTES + ")");
        }
        String serverHash = sha256Hex(png);
        if (!serverHash.equalsIgnoreCase(req.clientHash())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "기사 서명 무결성 검증 실패 — 클라이언트 hash 가 일치하지 않습니다");
        }

        // W10-4: 공개 모바일 endpoint = LINK source.
        applyMutation(() -> slip.recordDriverSignature(png, serverHash,
                SignatureChannel.MOBILE_CANVAS, SignatureSource.LINK));
        // audit: 기사 서명도 추적 — driverName + RECORD_DRIVER (별도 action), source=LINK
        auditRepository.save(SlipSignatureAudit.recordDriver(slip.getId(),
                slip.getDriverName(), slip.getDriverSignatureHash(), SignatureSource.LINK));

        return new com.samhanair.logis.slip.delivery.web.dto.PublicDriverSignatureResponse(
                slip.getDriverSignedAt(), slip.getDriverSignatureHash());
    }

    /**
     * 인수자 view 조회 — Plan §2 의 endpoint 2번. read-only.
     *
     * @param shareToken 인수자 share 토큰
     * @return read-only 슬립 핵심 + PNG base64 (UUID 미노출)
     * @throws BusinessException(NOT_FOUND) 토큰 미발견 또는 미서명 슬립
     * @throws BusinessException(CONFLICT) 토큰 만료 (Controller 가 410 GONE 으로 매핑)
     */
    @Transactional(readOnly = true)
    public PublicSignatureViewResponse findByShareToken(String shareToken) {
        Slip slip = slipRepository.findBySignatureShareTokenAndIsDeletedFalse(shareToken)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "유효하지 않은 토큰입니다"));
        if (!slip.isSigned()) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "유효하지 않은 토큰입니다");
        }
        if (slip.isSignatureShareExpired()) {
            throw new BusinessException(ErrorCode.CONFLICT, "토큰이 만료되었습니다");
        }

        BigDecimal total = BigDecimal.ZERO;
        java.util.List<PublicSignatureViewResponse.Slip.Line> lines = new java.util.ArrayList<>();
        for (SlipLine line : slip.getLines()) {
            lines.add(new PublicSignatureViewResponse.Slip.Line(
                    line.getProductName(),
                    line.getSpecification(),
                    line.getQuantity()));
            total = total.add(SlipDisplayAmount.vatInclusive(line));
        }

        PublicSignatureViewResponse.Slip slipView = new PublicSignatureViewResponse.Slip(
                slip.getSlipNo(),
                slip.getPartnerName(),
                slip.getSlipDate(),
                lines,
                total);

        String pngBase64 = null;
        if (slip.getSignaturePng() != null) {
            pngBase64 = "data:image/png;base64,"
                    + Base64.getEncoder().encodeToString(slip.getSignaturePng());
        }
        String hashShort = slip.getSignatureHash() != null && slip.getSignatureHash().length() >= 8
                ? slip.getSignatureHash().substring(0, 8)
                : slip.getSignatureHash();

        PublicSignatureViewResponse.Signature sig = new PublicSignatureViewResponse.Signature(
                slip.getSignerName(),
                slip.getSignedAt(),
                pngBase64,
                hashShort);

        return new PublicSignatureViewResponse(slipView, sig, slip.getSignatureShareExpiresAt());
    }

    /**
     * 관리자 서명 단건 조회 — Plan §2 의 endpoint 3번 (MANAGER/MASTER).
     *
     * @param slipId 슬립 UUID
     * @return 관리자용 서명 정보 (PNG base64 + hash 전체 64자 + share token)
     * @throws BusinessException(NOT_FOUND) 슬립 미발견
     */
    @Transactional(readOnly = true)
    public AdminSignatureResponse getSignature(UUID slipId) {
        Slip slip = slipRepository.findById(slipId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "전표를 찾을 수 없습니다"));
        return AdminSignatureResponse.from(slip);
    }

    /**
     * 관리자 서명 무효화 — Plan §2 의 endpoint 4번 (MASTER only).
     *
     * <p>처리 순서:
     * <ol>
     *   <li>슬립 lookup (없으면 NOT_FOUND)</li>
     *   <li>직전 hash/signerName snapshot (도메인 호출 후 NULL 됨)</li>
     *   <li>{@link Slip#invalidateSignature} 호출 — signedAt!=null 가드</li>
     *   <li>{@link SlipSignatureAudit#invalidate} INSERT (actorUserId=호출자)</li>
     * </ol>
     *
     * @param slipId 슬립 UUID
     * @param reason 무효화 사유 (필수)
     * @param actorUserId 처리자 user-id (X-User-Id, 필수 — controller 가드)
     * @return 갱신된 응답 (signed=false)
     * @throws BusinessException(NOT_FOUND) 슬립 미발견
     * @throws BusinessException(CONFLICT) 미서명 상태 무효화 시도
     * @throws BusinessException(INVALID_INPUT) reason null/blank
     */
    /**
     * Internal 전자서명 등록 — Phase 10 W10-4 (PR #99) 신규.
     *
     * <p>arologis-service 의 SlipClient 가 호출하는 {@code POST /internal/slips/{slipId}/signatures}
     * 의 backing service 메서드. 기존 공개 모바일 endpoint ({@link #recordSignature}) 와 차이:
     *
     * <ol>
     *   <li>source 는 항상 {@link SignatureSource#APP} (controller 가드 + service double-check)</li>
     *   <li>PNG bytes 미전송 — imageRef 만 보존 (Phase 11 cutover 시점 S3 실 업로드 + GET 시 해석).
     *       slip-service 측 signature_png 컬럼은 PNG-skip 모드로 비워둠. signature_hash 는 선택.</li>
     *   <li>driverCode 가 있으면 기사 서명({@link Slip#recordDriverSignature}) 분기,
     *       없으면 인수자 서명 ({@link Slip#recordSignature}) — 기본은 인수자.</li>
     *   <li>capturedAt 은 client (driver-app) 시각 — service 는 그대로 신뢰 (audit 추적 가능).</li>
     *   <li>SIGNABLE_STATUSES 가드 발생 시 CONFLICT (409) — controller 통과.</li>
     * </ol>
     *
     * <p>audit log: source=APP 명시 + actorUserId=internal-system (호출자 = ROLE_MASTER internal token).
     *
     * @param slipId 슬립 UUID
     * @param req 등록 요청
     * @return 등록 결과 (slipNo + signed/driverSigned 플래그)
     * @throws BusinessException(NOT_FOUND) 슬립 미발견
     * @throws BusinessException(CONFLICT) SIGNABLE_STATUSES 미충족 / 동시 수정 충돌
     * @throws BusinessException(INVALID_INPUT) source != APP / imageRef blank 등
     */
    public InternalSignatureResponse registerFromInternal(UUID slipId,
                                                          InternalSignatureRegistrationRequest req) {
        if (req.signatureSource() != SignatureSource.APP) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "Internal endpoint 는 APP source 만 허용합니다 (LINK 는 공개 모바일 endpoint 사용)");
        }
        Slip slip = slipRepository.findById(slipId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "전표를 찾을 수 없습니다"));

        boolean isDriver = req.driverCode() != null && !req.driverCode().isBlank();
        // imageRef placeholder bytes — V11 cutover 전까지 PNG bytes 자체는 보존 X.
        // BE-2 채택 fix — UTF-8 charset 명시 (한글 imageRef 회귀 가드)
        byte[] placeholderPng = ("imageRef:" + req.imageRef()).getBytes(StandardCharsets.UTF_8);
        String hash = (req.signatureHash() != null && !req.signatureHash().isBlank())
                ? req.signatureHash()
                : sha256Hex(placeholderPng);

        if (isDriver) {
            applyMutation(() -> slip.recordDriverSignature(placeholderPng, hash,
                    SignatureChannel.MOBILE_CANVAS, SignatureSource.APP));
            auditRepository.save(SlipSignatureAudit.recordDriver(slip.getId(),
                    req.driverCode(), hash, SignatureSource.APP));
        } else {
            String signerName = (req.signerName() != null && !req.signerName().isBlank())
                    ? req.signerName()
                    : "어플서명";
            applyMutation(() -> slip.recordSignature(signerName, placeholderPng, hash,
                    SignatureChannel.MOBILE_CANVAS, SignatureSource.APP));
            auditRepository.save(SlipSignatureAudit.record(slip.getId(),
                    signerName, hash, SignatureSource.APP));
        }
        return InternalSignatureResponse.from(slip, SignatureSource.APP, isDriver);
    }

    /**
     * partnerId 의 최근 활성 슬립 lookup — Phase 10 W10-4 (PR #99) 신규.
     *
     * <p>arologis-service 의 SlipResolver 가 partnerCode → partnerId resolve 후 본 service 의
     * slipId 매핑을 위해 호출. order by slipDate DESC, seqNo DESC — 가장 최근 슬립 1건.
     *
     * <p>매핑 실패 시 (해당 partner 의 active slip 없음) NOT_FOUND.
     */
    @Transactional(readOnly = true)
    public Slip findRecentByPartnerId(UUID partnerId) {
        if (partnerId == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "partnerId 필수");
        }
        var page = slipRepository.findAllByPartnerIdAndIsDeletedFalseOrderBySlipDateDescSeqNoDesc(
                partnerId, org.springframework.data.domain.PageRequest.of(0, 1));
        if (page.isEmpty()) {
            throw new BusinessException(ErrorCode.NOT_FOUND,
                    "해당 partnerId 의 활성 슬립을 찾을 수 없습니다");
        }
        return page.getContent().get(0);
    }

    /**
     * partnerCode 의 최근 활성 슬립 lookup — Phase 10 W10-4 종합 TM (BE-1 채택) 신규.
     *
     * <p>arologis-service 의 SlipResolver 가 카톡 파싱 partnerCode (사용자 노출 식별자) 로 직접 호출.
     * slip-service 는 자체 PartnerInternalClient 로 partner-service 의 {@code GET /internal/partners/{partnerCode}}
     * 를 호출하여 partnerId UUID 를 resolve 후 {@link #findRecentByPartnerId} 위임.
     *
     * <p>graceful empty 패턴 — partner-service 매핑 실패 (4xx/5xx/timeout) 또는 슬립 없음 시 empty
     * Optional 반환 (NOT_FOUND 던지지 않음). 호출자(arologis SlipResolver) 가 자체 INSERT 만 graceful
     * skip + warn log.
     *
     * @param partnerCode 사용자 노출 식별자 (카톡 파싱 결과 또는 dispatch stop.parsedPartnerCode)
     * @return 매칭된 Slip Optional. 매칭 실패 시 empty (NOT_FOUND 미반환).
     */
    @Transactional(readOnly = true)
    public Optional<Slip> findRecentByPartnerCode(String partnerCode) {
        if (partnerCode == null || partnerCode.isBlank()) {
            return Optional.empty();
        }
        Optional<UUID> partnerIdOpt = partnerInternalClient.resolvePartnerId(partnerCode);
        if (partnerIdOpt.isEmpty()) {
            return Optional.empty();
        }
        var page = slipRepository.findAllByPartnerIdAndIsDeletedFalseOrderBySlipDateDescSeqNoDesc(
                partnerIdOpt.get(), org.springframework.data.domain.PageRequest.of(0, 1));
        return page.isEmpty() ? Optional.empty() : Optional.of(page.getContent().get(0));
    }

    /**
     * Phase F (D-DF-05/06) — slipId 단건 lookup. SlipInternalController 의 /recipient-phone 및 /full
     * endpoint 에서 사용. 미발견 시 empty (404 매핑은 controller 책임).
     */
    @Transactional(readOnly = true)
    public Optional<Slip> findById(UUID slipId) {
        if (slipId == null) {
            return Optional.empty();
        }
        return slipRepository.findById(slipId);
    }

    public AdminSignatureResponse invalidateSignature(UUID slipId, String reason, String actorUserId) {
        Slip slip = slipRepository.findById(slipId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "전표를 찾을 수 없습니다"));
        // 직전 hash/signerName snapshot — invalidate 후 NULL 됨
        String prevHash = slip.getSignatureHash();
        String prevSignerName = slip.getSignerName();
        applyMutation(() -> slip.invalidateSignature(reason));
        auditRepository.save(SlipSignatureAudit.invalidate(slip.getId(),
                prevSignerName, prevHash, reason, actorUserId));
        return AdminSignatureResponse.from(slip);
    }

    // ---------- helpers ----------

    /**
     * slipNo slug 정규화 — design mobile-spec.md §1.1 권장 매핑.
     * 모바일에서 {@code 2026-05-05-1} 슬러그로 들어오면 {@code 2026/05/05-1} 로 복원.
     * 이미 슬래시 형식이면 그대로 반환.
     */
    private String canonicalSlipNo(String slipNo) {
        if (slipNo == null) {
            return null;
        }
        if (slipNo.contains("/")) {
            return slipNo;
        }
        // yyyy-MM-dd-N → yyyy/MM/dd-N
        // 첫 3개 dash 만 슬래시로 (4번째 dash 는 seqNo 분리자 보존)
        String[] parts = slipNo.split("-", 4);
        if (parts.length == 4) {
            return parts[0] + "/" + parts[1] + "/" + parts[2] + "-" + parts[3];
        }
        return slipNo;
    }

    /**
     * batch 의 slipNo 단건 조회 — 같은 batchId + slipNo 매칭 슬립 1건. soft-delete 제외.
     */
    private java.util.Optional<Slip> findBatchSlip(UUID batchId, String slipNo) {
        List<Slip> slips = slipRepository.findAllByDeliveryBatchIdAndIsDeletedFalse(batchId);
        return slips.stream()
                .filter(s -> slipNo.equals(s.getSlipNo()))
                .findFirst();
    }

    /**
     * data URI 또는 raw base64 → PNG bytes.
     * design mobile-spec.md §3.6: {@code data:image/png;base64,iVBORw0...} 형식.
     */
    private byte[] decodePng(String input) {
        if (input == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "signaturePngBase64 가 비어있습니다");
        }
        String base64 = input.contains(",") ? input.substring(input.indexOf(',') + 1) : input;
        try {
            return Base64.getDecoder().decode(base64);
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "PNG base64 디코드 실패");
        }
    }

    /** PNG bytes → SHA-256 hex 64자 (Plan §5 + design mobile-spec.md §3.7). */
    private String sha256Hex(byte[] data) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(data);
            StringBuilder sb = new StringBuilder(64);
            for (byte b : digest) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "SHA-256 알고리즘 미지원");
        }
    }

    /**
     * 도메인 mutation 실행 — 다른 service 와 일관된 예외 매핑 (CONFLICT/INVALID_INPUT).
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
