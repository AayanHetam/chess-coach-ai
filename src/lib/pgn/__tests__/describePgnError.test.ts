import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { describePgnError } from "../describePgnError";

/** What chess.js actually throws for `input` — the mapper's real inputs. */
function realError(input: string): string {
  try {
    new Chess().loadPgn(input);
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  throw new Error(`expected chess.js to reject ${JSON.stringify(input)}`);
}

describe("describePgnError", () => {
  it("turns the grammar's expectation list into plain words for pasted prose", () => {
    const pasted = "hello world this is not a pgn";
    const d = describePgnError(realError(pasted), pasted);
    expect(d.headline).toBe("That doesn't look like a PGN.");
    expect(d.detail).toContain('Reading stopped at "a"');
    expect(d.detail).toContain("1. e4 e5 2. Nf3");
    // The parser's own vocabulary never reaches the headline.
    expect(d.headline).not.toMatch(/brace comment|game termination marker/);
  });

  it("says 'notation' rather than 'not a PGN' when the paste has numbered moves", () => {
    const pasted = "1. e4 e5 2. Nf3 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0 extra";
    const d = describePgnError(realError(pasted), pasted);
    expect(d.headline).toBe("Something in that PGN isn't chess notation.");
    expect(d.detail).toContain('Reading stopped at "e"');
  });

  it("names the illegal move when the notation parses but the move does not", () => {
    const d = describePgnError("Invalid move in PGN: Nf9", "1. e4 e5 2. Nf9");
    expect(d.headline).toBe('"Nf9" isn\'t a legal move where it appears.');
    expect(d.detail).toMatch(/move just before it/);
  });

  it("explains a bad FEN header", () => {
    const d = describePgnError("Invalid FEN: piece data is invalid");
    expect(d.headline).toBe("The [FEN] header isn't a valid position.");
  });

  it("keeps an unknown message as the detail, never as the headline", () => {
    const d = describePgnError("Something odd happened");
    expect(d.headline).toBe("Couldn't read that PGN.");
    expect(d.detail).toBe("Something odd happened");
  });
});
