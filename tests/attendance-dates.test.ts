// tests/attendance-dates.test.ts

import { describe, expect, it } from "vitest";
import { isDateKey, shiftDate, todayInManila } from "@/features/attendance/dates";

describe("attendance dates", () => {
  it("uses the Philippine calendar day, not the UTC one", () => {
    // 5:00 pm UTC on Oct 1 is already 1:00 am on Oct 2 in Manila.
    expect(todayInManila(new Date("2026-10-01T17:00:00Z"))).toBe("2026-10-02");
    expect(todayInManila(new Date("2026-10-01T15:59:00Z"))).toBe("2026-10-01");
  });

  it("only accepts real calendar dates", () => {
    expect(isDateKey("2026-10-02")).toBe(true);
    expect(isDateKey("2026-02-30")).toBe(false);
    expect(isDateKey("10/02/2026")).toBe(false);
    expect(isDateKey("")).toBe(false);
  });

  it("moves across month and year ends", () => {
    expect(shiftDate("2026-10-01", -1)).toBe("2026-09-30");
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDate("2028-02-28", 1)).toBe("2028-02-29");
  });
});