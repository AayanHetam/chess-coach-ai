// The dark-glass analysis surface, served at /analysis as of the
// 2026-05-28 cutover. The implementation lives in `./preview/analysis.tsx`
// — keeping the file there for now means the existing /preview/analysis
// URL keeps working as an alias (handy for bookmarks during rollout).
// Once we're confident, this file gets collapsed back into a single source
// of truth and the preview path is deleted.
//
// The previous /analysis (Jotai + react-chessboard + classification panels)
// lives at /legacy/analysis as a one-release escape hatch.
import AnalysisPreviewPage from "./preview/analysis";

export default AnalysisPreviewPage;
