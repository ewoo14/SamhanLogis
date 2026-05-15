package com.samhanair.logis.arologis.service.copy;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * Phase F (D-DF-10) — CopyImageDiskStorage 단위 테스트.
 */
class CopyImageDiskStorageTest {

    @Test
    void save_creates_directory_and_writes_png(@TempDir Path tempDir) throws IOException {
        CopyImageDiskStorage storage = new CopyImageDiskStorage(tempDir.toString());
        UUID id = UUID.randomUUID();
        byte[] png = new byte[]{(byte) 0x89, 0x50, 0x4E, 0x47};

        String path = storage.save(id, png);

        assertThat(path).endsWith(id + ".png");
        assertThat(Files.exists(Path.of(path))).isTrue();
        assertThat(Files.readAllBytes(Path.of(path))).isEqualTo(png);
    }

    @Test
    void save_baseDir_does_not_exist_creates_it(@TempDir Path tempDir) throws IOException {
        Path nestedDir = tempDir.resolve("sub/nested");
        CopyImageDiskStorage storage = new CopyImageDiskStorage(nestedDir.toString());

        storage.save(UUID.randomUUID(), new byte[]{0x01});

        assertThat(Files.isDirectory(nestedDir)).isTrue();
    }

    @Test
    void getBaseDir_returns_configured_dir(@TempDir Path tempDir) {
        CopyImageDiskStorage storage = new CopyImageDiskStorage(tempDir.toString());
        assertThat(storage.getBaseDir()).isEqualTo(tempDir);
    }
}
