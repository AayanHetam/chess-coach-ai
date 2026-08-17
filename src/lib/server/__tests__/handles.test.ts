import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * A fake Firestore that enforces the constraints the real one does, because
 * the bugs worth catching here are exactly the ones a permissive mock hides:
 *
 *  - reads are rejected after the first write in a transaction
 *  - `create` fails when the document already exists
 *
 * Without those, a mock would happily pass code that throws in production the
 * first time someone renames.
 */

interface Doc {
  [k: string]: unknown;
}

class FakeDb {
  data = new Map<string, Doc>();
  /** Set by a test to make the next transaction attempt see a racing write. */
  onBeforeCommit?: () => void;

  private key(col: string, id: string) {
    return `${col}/${id}`;
  }

  collection(col: string) {
    return {
      doc: (id: string) => {
        const path = this.key(col, id);
        return {
          __path: path,
          // Non-transactional read, used by the advisory availability check.
          get: async () => {
            const data = this.data.get(path);
            return { exists: data !== undefined, data: () => data };
          },
        };
      },
    };
  }

  async runTransaction<T>(fn: (tx: FakeTx) => Promise<T>): Promise<T> {
    const tx = new FakeTx(this);
    const result = await fn(tx);
    this.onBeforeCommit?.();
    tx.commit();
    return result;
  }
}

class FakeTx {
  private wrote = false;
  private ops: (() => void)[] = [];
  constructor(private db: FakeDb) {}

  async get(ref: { __path: string }) {
    if (this.wrote) {
      throw new Error(
        "Firestore transactions require all reads before all writes"
      );
    }
    const data = this.db.data.get(ref.__path);
    return {
      exists: data !== undefined,
      data: () => data,
    };
  }

  create(ref: { __path: string }, value: Doc) {
    this.wrote = true;
    this.ops.push(() => {
      if (this.db.data.has(ref.__path)) {
        throw new Error("ALREADY_EXISTS");
      }
      this.db.data.set(ref.__path, value);
    });
  }

  update(ref: { __path: string }, value: Doc) {
    this.wrote = true;
    this.ops.push(() => {
      this.db.data.set(ref.__path, {
        ...(this.db.data.get(ref.__path) ?? {}),
        ...value,
      });
    });
  }

  delete(ref: { __path: string }) {
    this.wrote = true;
    this.ops.push(() => void this.db.data.delete(ref.__path));
  }

  commit() {
    for (const op of this.ops) op();
  }
}

const fake = new FakeDb();

vi.mock("../firebaseAdmin", () => ({
  getAdminFirestore: () => fake,
}));
vi.mock("../withFirestoreTimeout", () => ({
  withFirestoreTimeout: <T>(p: Promise<T>) => p,
}));

import { claimHandle, getUidByHandle, isHandleAvailable } from "../handles";

beforeEach(() => {
  fake.data.clear();
  fake.onBeforeCommit = undefined;
  fake.data.set("users/u1", { email: "a@b.c" });
  fake.data.set("users/u2", { email: "d@e.f" });
});

describe("claimHandle", () => {
  it("claims a free handle and denormalises both forms onto the user", () => {
    return claimHandle("u1", "Lazer_Wizard", 111).then((r) => {
      expect(r).toEqual({
        status: "ok",
        handle: "Lazer_Wizard",
        canonical: "lazerwizard",
      });
      expect(fake.data.get("handles/lazerwizard")).toEqual({
        uid: "u1",
        display: "Lazer_Wizard",
        claimedAt: 111,
      });
      expect(fake.data.get("users/u1")).toMatchObject({
        handle: "Lazer_Wizard",
        handleLower: "lazerwizard",
      });
    });
  });

  it("refuses a handle another user already holds", async () => {
    await claimHandle("u1", "lazerwizard");
    expect(await claimHandle("u2", "LazerWizard")).toEqual({ status: "taken" });
    // And the loser must not have overwritten the winner's user doc.
    expect(fake.data.get("users/u2")).not.toHaveProperty("handle");
  });

  it("treats separator variants as the SAME handle", async () => {
    // The phishing case: lazer_wizard and lazer-wizard must not be two people.
    await claimHandle("u1", "lazer_wizard");
    expect(await claimHandle("u2", "lazer-wizard")).toEqual({
      status: "taken",
    });
    expect(await claimHandle("u2", "lazerwizard")).toEqual({ status: "taken" });
  });

  it("is idempotent for the same user and handle", async () => {
    await claimHandle("u1", "lazerwizard");
    expect(await claimHandle("u1", "lazerwizard")).toEqual({
      status: "unchanged",
      handle: "lazerwizard",
    });
  });

  it("lets the owner change only their capitalisation", async () => {
    await claimHandle("u1", "lazerwizard");
    const r = await claimHandle("u1", "LazerWizard");
    expect(r.status).toBe("ok");
    expect(fake.data.get("users/u1")).toMatchObject({ handle: "LazerWizard" });
  });

  it("RENAMING works, and frees the old handle for someone else", async () => {
    // The read-after-write case. Firestore rejects a read issued after the
    // first write in a transaction, so a rename would throw while first-time
    // claims kept passing — invisible until a user renamed in production.
    await claimHandle("u1", "oldname");
    const r = await claimHandle("u1", "newname");
    expect(r.status).toBe("ok");
    expect(fake.data.has("handles/oldname")).toBe(false);
    expect(fake.data.get("handles/newname")).toMatchObject({ uid: "u1" });
    expect(await claimHandle("u2", "oldname")).toMatchObject({ status: "ok" });
  });

  it("never frees a reservation the user does not own", async () => {
    // Identity-theft primitive: point your own handleLower at someone else's
    // handle and have the rename release it for you to claim.
    await claimHandle("u2", "victim");
    fake.data.set("users/u1", { email: "a@b.c", handleLower: "victim" });
    await claimHandle("u1", "attacker");
    expect(fake.data.get("handles/victim")).toMatchObject({ uid: "u2" });
  });

  it("rejects an invalid handle before touching the database", async () => {
    const r = await claimHandle("u1", "no");
    expect(r.status).toBe("invalid");
    expect(fake.data.size).toBe(2); // only the two seeded users
  });

  it("rejects a reserved handle", async () => {
    expect((await claimHandle("u1", "admin")).status).toBe("invalid");
  });

  it("loses the race rather than double-claiming", async () => {
    // Two writers, same handle, one commit interleaved between read and write.
    fake.onBeforeCommit = () => {
      fake.data.set("handles/racy", {
        uid: "u2",
        display: "racy",
        claimedAt: 1,
      });
      fake.onBeforeCommit = undefined;
    };
    await expect(claimHandle("u1", "racy")).rejects.toThrow("ALREADY_EXISTS");
    expect(fake.data.get("handles/racy")).toMatchObject({ uid: "u2" });
  });
});

describe("lookups", () => {
  it("resolves a handle to its uid, case- and separator-insensitively", async () => {
    await claimHandle("u1", "Lazer_Wizard");
    expect(await getUidByHandle("lazerwizard")).toBe("u1");
    expect(await getUidByHandle("LAZER-WIZARD")).toBe("u1");
    expect(await getUidByHandle("nobody")).toBeNull();
    expect(await getUidByHandle("")).toBeNull();
  });

  it("reports availability, and counts your own handle as available to you", async () => {
    await claimHandle("u1", "taken1");
    expect(await isHandleAvailable("free1")).toBe(true);
    expect(await isHandleAvailable("taken1")).toBe(false);
    expect(await isHandleAvailable("taken1", "u1")).toBe(true);
    expect(await isHandleAvailable("taken1", "u2")).toBe(false);
    // Invalid input is never "available".
    expect(await isHandleAvailable("no")).toBe(false);
    expect(await isHandleAvailable("admin")).toBe(false);
  });
});
