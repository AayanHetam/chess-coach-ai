/**
 * The box a board occupies, with no board in it yet.
 *
 * ChessgroundBoard is loaded through next/dynamic with `ssr: false` at every
 * callsite (chessground touches `document` on import), and a dynamic import
 * with no `loading` renders null until its chunk lands. On /analysis that
 * meant the board's wrapper — `height: auto` around a null child — was zero
 * pixels tall for as long as the fetch took, and then 306px tall all at once:
 * 0.34 of CLS on a throttled mobile, measured on production, and the worst
 * single layout shift on the site.
 *
 * This is deliberately the same element as ChessgroundBoard's own outer div,
 * so a parent sizing itself off the child cannot tell the two apart. Keep the
 * two in step if that outer div ever changes.
 *
 * It lives in its own module, and that is the whole point of the file: a
 * static `import { ChessgroundBoardPlaceholder } from "./ChessgroundBoard"`
 * would pull chessground, its three stylesheets and its `document` access
 * back into the parent chunk and undo the `ssr: false` it exists to serve.
 * Nothing here may import chessground.
 */
export function ChessgroundBoardPlaceholder() {
  return (
    <div
      aria-hidden
      style={{ width: "100%", position: "relative", aspectRatio: "1 / 1" }}
    />
  );
}
