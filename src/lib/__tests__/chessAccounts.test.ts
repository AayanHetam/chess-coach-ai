import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEVICE_KEY,
  profileUsername,
  readDeviceUsername,
  rememberTarget,
  sameUsername,
  savedUsername,
  usernameSavedMessage,
  writeDeviceUsername,
} from "@/lib/chessAccounts";

/**
 * The reader's own Chess.com and Lichess usernames.
 *
 * The rule these pin (founder feedback 2026-10-16): the load dialog opens on
 * the saved username, and the first username a reader loads a game from is
 * saved as theirs, on the profile when signed in and on the device when not.
 * After that a different name is a lookup and changes nothing.
 */

describe("profileUsername / savedUsername", () => {
  it("reads the profile's field for each platform, trimmed", () => {
    const profile = { chesscomUsername: " hikaru ", lichessUsername: "DrNyk" };
    expect(profileUsername(profile, "chesscom")).toBe("hikaru");
    expect(profileUsername(profile, "lichess")).toBe("DrNyk");
    expect(profileUsername(null, "chesscom")).toBe("");
    expect(profileUsername({}, "lichess")).toBe("");
  });

  it("prefers the profile over the device, and falls back to the device", () => {
    expect(
      savedUsername("chesscom", { chesscomUsername: "mine" }, "typed")
    ).toBe("mine");
    expect(
      savedUsername("chesscom", { lichessUsername: "other" }, "typed")
    ).toBe("typed");
    expect(savedUsername("lichess", null, "  ")).toBe("");
  });
});

describe("rememberTarget", () => {
  const base = { profileValue: "", deviceValue: "", username: "hikaru" };

  it("saves to the profile when a signed-in reader has none for the platform", () => {
    expect(rememberTarget({ ...base, account: "signed-in" })).toBe("profile");
  });

  it("changes nothing once a username is saved: another name is a lookup", () => {
    expect(
      rememberTarget({ ...base, account: "signed-in", profileValue: "aayan" })
    ).toBeNull();
    expect(
      rememberTarget({ ...base, account: "signed-out", deviceValue: "aayan" })
    ).toBeNull();
  });

  it("remembers on the device for a signed-out reader", () => {
    expect(rememberTarget({ ...base, account: "signed-out" })).toBe("device");
  });

  it("a device name does not stop a signed-in reader's first profile save", () => {
    expect(
      rememberTarget({ ...base, account: "signed-in", deviceValue: "aayan" })
    ).toBe("profile");
  });

  it("saves nothing while the account is loading, so it cannot overwrite a saved name", () => {
    expect(rememberTarget({ ...base, account: "loading" })).toBeNull();
  });

  it("saves nothing for an empty username", () => {
    expect(
      rememberTarget({ ...base, account: "signed-in", username: "   " })
    ).toBeNull();
  });
});

describe("usernameSavedMessage", () => {
  it("names the username, the platform, and where to change it", () => {
    expect(
      usernameSavedMessage({ platform: "chesscom", username: "hikaru" })
    ).toBe(
      "Saved hikaru as your Chess.com username. Change it any time in Profile."
    );
    expect(
      usernameSavedMessage({ platform: "lichess", username: "DrNyk" })
    ).toBe(
      "Saved DrNyk as your Lichess username. Change it any time in Profile."
    );
  });
});

describe("sameUsername", () => {
  it("compares the way both platforms do: case- and whitespace-blind", () => {
    expect(sameUsername("Hikaru", " hikaru ")).toBe(true);
    expect(sameUsername("hikaru", "hikaru2")).toBe(false);
  });
});

describe("readDeviceUsername / writeDeviceUsername", () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => (k in store ? store[k] : null),
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips in the JSON form the old useLocalStorage inputs wrote", () => {
    writeDeviceUsername("chesscom", " hikaru ");
    expect(store[DEVICE_KEY.chesscom]).toBe('"hikaru"');
    expect(readDeviceUsername("chesscom")).toBe("hikaru");
    expect(readDeviceUsername("lichess")).toBe("");
  });

  it("reads a bare value and a numeric one", () => {
    store[DEVICE_KEY.lichess] = "DrNykterstein";
    expect(readDeviceUsername("lichess")).toBe("DrNykterstein");
    store[DEVICE_KEY.lichess] = "12345";
    expect(readDeviceUsername("lichess")).toBe("12345");
  });

  it("reads nothing from a value that is not a name", () => {
    store[DEVICE_KEY.chesscom] = "{}";
    expect(readDeviceUsername("chesscom")).toBe("");
  });

  it("survives storage that throws", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(readDeviceUsername("chesscom")).toBe("");
    expect(() => writeDeviceUsername("chesscom", "x")).not.toThrow();
  });
});
