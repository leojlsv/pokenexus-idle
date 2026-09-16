import { describe, expect, it } from "vitest";
import { canonicalizeRecoveryEmail } from "./email";

describe("canonicalizeRecoveryEmail", () => {
  it("normalizes only the accepted v1 equality dimensions", () => {
    expect(canonicalizeRecoveryEmail("  User+Tag@BÜCHER.Example\t")).toEqual({
      canonical: "user+tag@xn--bcher-kva.example",
      delivery: "User+Tag@xn--bcher-kva.example",
    });
    expect(canonicalizeRecoveryEmail("a.b@example.com").canonical).not.toBe(
      canonicalizeRecoveryEmail("ab@example.com").canonical,
    );
    expect(canonicalizeRecoveryEmail("a+tag@example.com").canonical).not.toBe(
      canonicalizeRecoveryEmail("a@example.com").canonical,
    );
  });

  it("accepts valid ASCII quoted local-parts without treating quoted @ or specials as syntax", () => {
    expect(canonicalizeRecoveryEmail('"A@B"@Example.com')).toEqual({
      canonical: '"a@b"@example.com',
      delivery: '"A@B"@example.com',
    });
    expect(canonicalizeRecoveryEmail('"A\\"B"@Example.com')).toEqual({
      canonical: '"a\\"b"@example.com',
      delivery: '"A\\"B"@example.com',
    });
  });

  it.each([
    "Display Name <user@example.com>",
    "user(comment)@example.com",
    "üser@example.com",
    "user@",
    "@example.com",
    "user@@example.com",
    "user example@example.com",
    "user\n@example.com",
    '"unterminated@example.com',
    '"closed"extra@example.com',
  ])("rejects unsupported or ambiguous addr-spec %s", (value) => {
    expect(() => canonicalizeRecoveryEmail(value)).toThrow();
  });
});
