package com.samhanair.logis.arologis.service.copy;

import com.samhanair.logis.arologis.client.SlipClient;
import com.samhanair.logis.arologis.client.SlipClient.SignaturePayload;
import com.samhanair.logis.arologis.domain.Signature;
import com.samhanair.logis.arologis.domain.SignatureSource;
import com.samhanair.logis.arologis.domain.Vehicle;
import com.samhanair.logis.arologis.domain.VehicleStop;
import com.samhanair.logis.arologis.repository.SignatureRepository;
import com.samhanair.logis.arologis.repository.VehicleRepository;
import com.samhanair.logis.arologis.repository.VehicleStopRepository;
import com.samhanair.logis.arologis.service.SlipResolver;
import com.samhanair.logis.arologis.web.dto.copy.SignAndSendCopyRequest;
import java.io.IOException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Phase F (D-DF-01~12) — 전자서명 양쪽 저장 + 사본 PNG 합성/저장 orchestration.
 *
 * <p>Tx1 [보상 트랜잭션 — atomic 양쪽 저장]: arologis Signature INSERT + slip-service registerSignature.
 * 둘 다 OK 여야 진행. b 5xx/timeout 시 a rollback (Spring @Transactional propagation).
 *
 * <p>Tx2 [best effort — 사본 합성/저장]: PlaywrightCopyRenderer + CopyImageDiskStorage + markCopySent.
 * fail 시 markCopyFailure (copySendFailureCount++) + JSON 응답 (200) — 사용자 같은 endpoint 재호출 OK.
 *
 * <p>경로 매핑: dispatchId + vehicleSeq → Vehicle, vehicleId + stopSeq → VehicleStop. 권한 검증은
 * vehicle.assignedDriverId == driverIdFromJwt (D-DF-08).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SignAndSendCopyService {

    private final SignatureRepository signatureRepository;
    private final VehicleRepository vehicleRepository;
    private final VehicleStopRepository vehicleStopRepository;
    private final SlipResolver slipResolver;
    private final SlipClient slipClient;
    private final PlaywrightCopyRenderer renderer;
    private final CopyImageDiskStorage storage;

    /**
     * sign-and-send-copy endpoint orchestration.
     *
     * @return SignAndSendCopyResult — controller 가 image/png (성공) 또는 JSON (skip/fail/duplicate) 분기.
     * @throws BridgeFailedException Tx1 보상 실패 (slip-service 5xx/timeout/매핑 실패) → controller 422.
     * @throws SecurityException 본인 dispatch 가 아님 (driverId mismatch) → controller 403.
     * @throws IllegalArgumentException stop/vehicle 미발견 → controller 400.
     */
    public SignAndSendCopyResult execute(UUID dispatchId, int vehicleSeq, int stopSeq,
                                          UUID driverIdFromJwt,
                                          SignAndSendCopyRequest request) {
        // 0. vehicle/stop 조회 + 본인 dispatch 권한 검증 (D-DF-08)
        Vehicle vehicle = vehicleRepository.findFirstByDispatchIdAndSequence(dispatchId, vehicleSeq)
                .orElseThrow(() -> new IllegalArgumentException(
                        "vehicle 미발견 — dispatchId=" + dispatchId + ", vehicleSeq=" + vehicleSeq));
        if (vehicle.getAssignedDriverId() == null
                || !vehicle.getAssignedDriverId().equals(driverIdFromJwt)) {
            throw new SecurityException("본인 dispatch 가 아님 — assignedDriverId mismatch");
        }
        VehicleStop stop = vehicleStopRepository.findFirstByVehicleIdAndSequence(vehicle.getId(), stopSeq)
                .orElseThrow(() -> new IllegalArgumentException(
                        "stop 미발견 — vehicleId=" + vehicle.getId() + ", stopSeq=" + stopSeq));

        // 1. 1회 가드 (D-DF-04) — 기존 Signature 조회 (stopId + APP source 의 가장 최근 1건)
        Optional<Signature> existing = findLatestAppSignature(stop.getId());
        if (existing.isPresent() && existing.get().isCopySent()) {
            return SignAndSendCopyResult.alreadySent(existing.get().getCopySentAt());
        }

        // 2. Tx1 — atomic 양쪽 저장 (existing 이 있으면 재사용, fail 후 retry 케이스)
        Signature signature = saveSignatureBoth(stop, request, existing);

        // 3. 인수자 번호 lookup (slip recipientPhone)
        Optional<String> recipientPhone = slipResolver.findRecipientPhone(stop);
        if (recipientPhone.isEmpty() || recipientPhone.get().isBlank()) {
            return SignAndSendCopyResult.phoneMissing(signature.getId());
        }

        // 4. Tx2 — best effort PNG 합성 + 저장
        return tryRenderAndStore(signature, stop, request, recipientPhone.get());
    }

    /**
     * Tx1 — Spring REQUIRED propagation, slip-service fail 시 rollback.
     *
     * @throws BridgeFailedException slip-service 호출 실패 (controller 가 422 매핑)
     */
    @Transactional(propagation = Propagation.REQUIRED)
    protected Signature saveSignatureBoth(VehicleStop stop,
                                           SignAndSendCopyRequest request,
                                           Optional<Signature> existing) {
        // 기존 signature 가 있으면 (사본만 fail 후 retry 케이스) 재사용, 아니면 신규
        // imageRef placeholder — Phase F PoC, 실 imageRef 는 후속 file-server PR 에서 분리
        Signature signature = existing.orElseGet(() ->
                signatureRepository.save(Signature.of(
                        stop.getId(), SignatureSource.APP,
                        "inline-base64",
                        request.capturedAt(), request.gpsLat(), request.gpsLng())));

        // slip-service 호출 — skeleton-mode false 활성 (DevOps env)
        Optional<UUID> slipIdOpt = slipResolver.resolveSlipId(stop);
        if (slipIdOpt.isEmpty()) {
            throw new BridgeFailedException("SLIP_RESOLVE_FAILED");
        }

        boolean ok = slipClient.registerSignature(slipIdOpt.get(),
                SignaturePayload.appReceiver(
                        "inline-base64",
                        // signerName placeholder — VehicleStop 에 인수자명 없음 (kakao parse 단계 미수집).
                        // 후속 PR 에서 SlipFullDetail.partnerName 으로 보완 가능.
                        "어플인수자",
                        request.capturedAt(),
                        request.gpsLat(),
                        request.gpsLng()));
        if (!ok) {
            throw new BridgeFailedException("SLIP_SERVICE_REJECTED");
        }
        return signature;
    }

    private SignAndSendCopyResult tryRenderAndStore(Signature signature, VehicleStop stop,
                                                     SignAndSendCopyRequest request,
                                                     String recipientPhone) {
        try {
            byte[] png = renderer.render(
                    slipResolver.buildSlipDataMap(stop),
                    request.driverSignatureBase64(),
                    request.recipientSignatureBase64());
            String path = storage.save(signature.getId(), png);
            signature.markCopySent(path, recipientPhone);
            signatureRepository.save(signature);
            return SignAndSendCopyResult.success(signature.getId(), png,
                    signature.getCopySentAt(), maskPhone(recipientPhone));
        } catch (PlaywrightCopyRenderer.RendererTimeoutException ex) {
            log.warn("사본 fail RENDERER_TIMEOUT — signatureId={}", signature.getId());
            signature.markCopyFailure();
            signatureRepository.save(signature);
            return SignAndSendCopyResult.copyFailed(signature.getId(), CopyFailureReason.RENDERER_TIMEOUT);
        } catch (PlaywrightCopyRenderer.RendererErrorException ex) {
            log.warn("사본 fail RENDERER_ERROR — signatureId={}, msg={}", signature.getId(), ex.getMessage());
            signature.markCopyFailure();
            signatureRepository.save(signature);
            return SignAndSendCopyResult.copyFailed(signature.getId(), CopyFailureReason.RENDERER_ERROR);
        } catch (IOException ex) {
            log.warn("사본 fail STORAGE_FULL — signatureId={}, msg={}", signature.getId(), ex.getMessage());
            signature.markCopyFailure();
            signatureRepository.save(signature);
            return SignAndSendCopyResult.copyFailed(signature.getId(), CopyFailureReason.STORAGE_FULL);
        }
    }

    /** stopId + APP source 의 가장 최근 Signature 1건 조회. */
    private Optional<Signature> findLatestAppSignature(UUID stopId) {
        List<Signature> all = signatureRepository.findAllByStopIdOrderByCapturedAtDesc(stopId);
        return all.stream().filter(s -> s.getSource() == SignatureSource.APP).findFirst();
    }

    /** 인수자 번호 마스킹 (D-DF-09) — UI/응답/log 용. DB 는 풀 번호 보관. */
    static String maskPhone(String phone) {
        if (phone == null || phone.length() < 8) return phone;
        return phone.substring(0, 3) + "-****-" + phone.substring(phone.length() - 4);
    }

    /** Tx1 보상 — slip-service 실패 시 throw, controller 가 422 매핑. */
    public static class BridgeFailedException extends RuntimeException {
        public BridgeFailedException(String reason) { super(reason); }
    }

    /**
     * 결과 envelope — controller 가 image/png 또는 JSON 분기.
     */
    public record SignAndSendCopyResult(
            byte[] png,
            UUID signatureId,
            boolean alreadySent,
            LocalDateTime copySentAt,
            String copyRecipientPhoneMasked,
            CopyFailureReason failureReason,
            LocalDateTime previousCopySentAt) {

        public static SignAndSendCopyResult success(UUID signatureId, byte[] png,
                                                     LocalDateTime sentAt, String maskedPhone) {
            return new SignAndSendCopyResult(png, signatureId, false, sentAt, maskedPhone, null, null);
        }
        public static SignAndSendCopyResult phoneMissing(UUID signatureId) {
            return new SignAndSendCopyResult(null, signatureId, false, null, null,
                    CopyFailureReason.RECIPIENT_PHONE_MISSING, null);
        }
        public static SignAndSendCopyResult copyFailed(UUID signatureId, CopyFailureReason reason) {
            return new SignAndSendCopyResult(null, signatureId, false, null, null, reason, null);
        }
        public static SignAndSendCopyResult alreadySent(LocalDateTime previousSentAt) {
            return new SignAndSendCopyResult(null, null, true, null, null, null, previousSentAt);
        }
    }
}
