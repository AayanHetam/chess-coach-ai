/**
 * One height for the /database table region.
 *
 * Three things have to agree on it and they live in different chunks:
 *
 *   - the `loading` Skeleton in src/pages/database.tsx,
 *   - the Grid cell that holds the table,
 *   - the DataGrid in ./GamesTable.tsx.
 *
 * They used to disagree. The skeleton reserved 360px, an empty DataGrid is
 * 163px, and the swap from one to the other pulled the page up by ~200px the
 * moment the @mui/x-data-grid chunk landed — 0.06 of CLS on a page with no
 * other shift in it, and a placeholder that caused the jump it existed to
 * prevent.
 *
 * It is its own module rather than an export from either side because
 * /database loads GamesTable through next/dynamic precisely to keep
 * @mui/x-data-grid out of the first load. A plain `import { ... } from
 * "./GamesTable"` would drag the whole grid back into the page chunk and
 * undo that.
 */
export const GAMES_TABLE_MIN_HEIGHT = 360;

/**
 * And one width, for the same reason and with the same three consumers.
 *
 * The horizontal half of the bug was the subtler one. The Grid cell was
 * shrink-to-fit with `minWidth="50px"`, so it was 50px wide while the
 * skeleton was in it and snapped to the full row once the DataGrid's column
 * widths arrived. Reserving only the height made that *worse*, not better: a
 * 360px-tall box sliding 154px sideways scores higher than a 163px one.
 */
export const GAMES_TABLE_MAX_WIDTH = 1100;
