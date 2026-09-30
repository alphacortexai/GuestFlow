import { describe, expect, it } from "vitest";
import { isValidPhone, normalizePhone } from "./phone";

describe("phone validation", () => {
  it.each([
    "+256 701 234 567",
    "0701234567",
    "+1 (202) 555-0123",
    "00 44 20 7946 0958",
    "202 555 0123",
  ])("accepts %s", (phone) => {
    expect(isValidPhone(phone)).toBe(true);
  });

  it.each(["", "123456", "+256 abc 123", "+1234567890123456"]) (
    "rejects %s",
    (phone) => {
      expect(isValidPhone(phone)).toBe(false);
    },
  );

  it("removes formatting and an international 00 prefix without changing local numbers", () => {
    expect(normalizePhone("00 44 20 7946 0958")).toBe("442079460958");
    expect(normalizePhone("0701234567")).toBe("0701234567");
  });
});
