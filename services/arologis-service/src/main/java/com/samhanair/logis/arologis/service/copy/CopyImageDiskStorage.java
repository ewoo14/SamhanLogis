package com.samhanair.logis.arologis.service.copy;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 사본 PNG 디스크 저장 — Phase F (D-DF-10).
 *
 * <p>경로: {AROLOGIS_SIGNATURE_COPY_DIR}/{signatureId}.png
 * Phase 11 AWS 이전 시 S3 키로 갈아탐 (마이그레이션 별도 PR).
 */
@Slf4j
@Component
public class CopyImageDiskStorage {

    private final Path baseDir;

    public CopyImageDiskStorage(
            @Value("${arologis.signature-copy.dir:/var/lib/arologis/signature-copies}") String dir) {
        this.baseDir = Paths.get(dir);
    }

    /**
     * PNG byte[] 저장 후 절대 경로 반환.
     *
     * @param signatureId 서명 UUID (파일명 prefix)
     * @param png PNG byte[]
     * @return 절대 경로 String (Signature.copy_image_path 에 저장)
     * @throws IOException 디렉토리 생성/파일 쓰기 실패
     */
    public String save(UUID signatureId, byte[] png) throws IOException {
        Files.createDirectories(baseDir);
        Path filePath = baseDir.resolve(signatureId + ".png");
        Files.write(filePath, png);
        log.debug("사본 PNG 저장 — signatureId={}, path={}, size={} bytes",
                signatureId, filePath, png.length);
        return filePath.toAbsolutePath().toString();
    }

    /** Admin 재발송 후속 PR 용 — 현재 PR 에서는 미호출, getter 만. */
    public Path getBaseDir() {
        return baseDir;
    }
}
