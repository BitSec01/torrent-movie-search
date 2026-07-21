/** @jest-environment node */

jest.mock("@/lib/library/auto-organize", () => ({ runAutoOrganize: jest.fn() }));

import {
  isAutoOrganizeEnabled,
  startAutoOrganizeScheduler,
  stopAutoOrganizeScheduler,
} from "@/lib/library/scheduler";
import { runAutoOrganize } from "@/lib/library/auto-organize";

const runMock = runAutoOrganize as jest.MockedFunction<typeof runAutoOrganize>;
const IDLE = { claimed: 0, organized: 0, failed: 0, skipped: 0 };

describe("isAutoOrganizeEnabled", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.AUTO_ORGANIZE;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("is on by default", () => {
    expect(isAutoOrganizeEnabled()).toBe(true);
  });

  it("is off only when explicitly disabled", () => {
    process.env.AUTO_ORGANIZE = "false";
    expect(isAutoOrganizeEnabled()).toBe(false);
  });
});

describe("startAutoOrganizeScheduler", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.AUTO_ORGANIZE_INTERVAL_MS = "60000";
    jest.useFakeTimers();
    jest.clearAllMocks();
    runMock.mockResolvedValue(IDLE);
  });

  afterEach(() => {
    stopAutoOrganizeScheduler();
    jest.useRealTimers();
    process.env = originalEnv;
  });

  it("does not sweep immediately on startup", () => {
    startAutoOrganizeScheduler();

    expect(runMock).not.toHaveBeenCalled();
  });

  it("sweeps once the interval elapses", async () => {
    startAutoOrganizeScheduler();

    await jest.advanceTimersByTimeAsync(60_000);

    expect(runMock).toHaveBeenCalledTimes(1);
  });

  it("keeps sweeping on subsequent intervals", async () => {
    startAutoOrganizeScheduler();

    await jest.advanceTimersByTimeAsync(180_000);

    expect(runMock).toHaveBeenCalledTimes(3);
  });

  it("waits for a slow sweep to finish rather than overlapping it", async () => {
    let release: () => void = () => {};
    runMock.mockImplementation(
      () => new Promise((resolve) => { release = () => resolve(IDLE); })
    );

    startAutoOrganizeScheduler();
    await jest.advanceTimersByTimeAsync(180_000);

    expect(runMock).toHaveBeenCalledTimes(1);

    release();
    await jest.advanceTimersByTimeAsync(60_000);

    expect(runMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the timer alive when a sweep throws", async () => {
    runMock.mockRejectedValueOnce(new Error("qBittorrent unreachable"));
    jest.spyOn(console, "error").mockImplementation(() => {});

    startAutoOrganizeScheduler();
    await jest.advanceTimersByTimeAsync(120_000);

    expect(runMock).toHaveBeenCalledTimes(2);
  });

  it("starts nothing when disabled", async () => {
    process.env.AUTO_ORGANIZE = "false";

    startAutoOrganizeScheduler();
    await jest.advanceTimersByTimeAsync(120_000);

    expect(runMock).not.toHaveBeenCalled();
  });

  it("ignores a second start so there is only ever one timer", async () => {
    startAutoOrganizeScheduler();
    startAutoOrganizeScheduler();

    await jest.advanceTimersByTimeAsync(60_000);

    expect(runMock).toHaveBeenCalledTimes(1);
  });

  it("clamps a too-aggressive interval to avoid hammering qBittorrent", async () => {
    stopAutoOrganizeScheduler();
    process.env.AUTO_ORGANIZE_INTERVAL_MS = "1000";

    startAutoOrganizeScheduler();
    await jest.advanceTimersByTimeAsync(1000);
    expect(runMock).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(29_000);
    expect(runMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the default interval when the env value is nonsense", async () => {
    stopAutoOrganizeScheduler();
    process.env.AUTO_ORGANIZE_INTERVAL_MS = "not-a-number";

    startAutoOrganizeScheduler();
    await jest.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(runMock).toHaveBeenCalledTimes(1);
  });
});
