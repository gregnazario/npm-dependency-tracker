import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { detectPackageManager } from "../../src/parsers/detect";

describe("detectPackageManager", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "detect-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true });
  });

  test("detects bun from bun.lockb", () => {
    writeFileSync(join(tempDir, "package.json"), "{}");
    writeFileSync(join(tempDir, "bun.lockb"), "");
    expect(detectPackageManager(tempDir)).toBe("bun");
  });

  test("detects bun from bun.lock", () => {
    writeFileSync(join(tempDir, "package.json"), "{}");
    writeFileSync(join(tempDir, "bun.lock"), "{}");
    expect(detectPackageManager(tempDir)).toBe("bun");
  });

  test("detects pnpm from pnpm-lock.yaml", () => {
    writeFileSync(join(tempDir, "package.json"), "{}");
    writeFileSync(join(tempDir, "pnpm-lock.yaml"), "");
    expect(detectPackageManager(tempDir)).toBe("pnpm");
  });

  test("detects yarn from yarn.lock", () => {
    writeFileSync(join(tempDir, "package.json"), "{}");
    writeFileSync(join(tempDir, "yarn.lock"), "");
    expect(detectPackageManager(tempDir)).toBe("yarn");
  });

  test("detects npm from package-lock.json", () => {
    writeFileSync(join(tempDir, "package.json"), "{}");
    writeFileSync(join(tempDir, "package-lock.json"), "{}");
    expect(detectPackageManager(tempDir)).toBe("npm");
  });

  test("bun takes priority over npm", () => {
    writeFileSync(join(tempDir, "package.json"), "{}");
    writeFileSync(join(tempDir, "bun.lockb"), "");
    writeFileSync(join(tempDir, "package-lock.json"), "{}");
    expect(detectPackageManager(tempDir)).toBe("bun");
  });

  test("returns null when no lockfile found", () => {
    writeFileSync(join(tempDir, "package.json"), "{}");
    expect(detectPackageManager(tempDir)).toBeNull();
  });

  test("throws when no package.json found", () => {
    expect(() => detectPackageManager(tempDir)).toThrow("No package.json");
  });
});
