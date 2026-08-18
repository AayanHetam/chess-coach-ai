import { describe, it, expect } from "vitest";
import {
  addressAs,
  firstNameOf,
  avatarInitial,
  FALLBACK_NAME,
} from "../displayIdentity";

describe("addressAs", () => {
  it("prefers the handle the user chose", () => {
    expect(
      addressAs({
        handle: "LazerWizard",
        displayName: "Aayan Hetam",
        email: "a@example.com",
      })
    ).toBe("LazerWizard");
  });

  it("falls back to display name, then the email local part", () => {
    expect(addressAs({ displayName: "Ana Sousa", email: "ana@x.com" })).toBe(
      "Ana Sousa"
    );
    expect(addressAs({ email: "ana@x.com" })).toBe("ana");
  });

  it("never returns an empty string", () => {
    // A blank greeting ("Welcome back,") reads as a bug, and every caller is
    // rendering into a sentence.
    for (const u of [
      null,
      undefined,
      {},
      { handle: "   " },
      { displayName: "  " },
      { email: "  " },
      { email: "@nolocal.com" },
      { handle: "", displayName: "", email: "" },
    ]) {
      expect(addressAs(u), JSON.stringify(u)).toBeTruthy();
    }
    expect(addressAs({})).toBe(FALLBACK_NAME);
  });

  it("does not let whitespace beat a real value further down the chain", () => {
    expect(addressAs({ handle: "  ", displayName: "Ana" })).toBe("Ana");
    expect(addressAs({ handle: " ", displayName: " ", email: "ana@x.com" })).toBe(
      "ana"
    );
  });

  it("trims what it returns", () => {
    expect(addressAs({ handle: "  lazer  " })).toBe("lazer");
  });
});

describe("firstNameOf", () => {
  it("takes the first word of a full name", () => {
    expect(firstNameOf({ displayName: "Ana Maria Sousa" })).toBe("Ana");
  });

  it("is a no-op for handles, which have no spaces", () => {
    expect(firstNameOf({ handle: "LazerWizard" })).toBe("LazerWizard");
  });

  it("survives an unknown user", () => {
    expect(firstNameOf(null)).toBe(FALLBACK_NAME);
  });
});

describe("avatarInitial", () => {
  it("uppercases", () => {
    expect(avatarInitial({ handle: "lazerwizard" })).toBe("L");
    expect(avatarInitial({ email: "ana@x.com" })).toBe("A");
  });

  it("is never blank — an empty circle reads as a broken image", () => {
    expect(avatarInitial(null)).toBe("C");
    expect(avatarInitial({})).toBe("C");
    expect(avatarInitial({ handle: "   " })).toBe("C");
  });
});

describe("per-surface fallback", () => {
  it("lets a caller choose its own last resort", () => {
    // /plan greets "Welcome back, there"; an account menu needs a noun. One
    // precedence chain, two endings.
    expect(addressAs({}, "there")).toBe("there");
    expect(firstNameOf(null, "there")).toBe("there");
  });

  it("does not let the fallback outrank a real identity", () => {
    expect(addressAs({ handle: "lazer" }, "there")).toBe("lazer");
    expect(addressAs({ email: "ana@x.com" }, "there")).toBe("ana");
  });

  it("returns a multi-word fallback whole", () => {
    // Splitting it yields "Welcome, Chess!".
    expect(firstNameOf({}, "friend of chess")).toBe("friend of chess");
  });
});
