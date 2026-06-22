import { useCallback, useEffect, useState } from "react";
import Head from "next/head";
import {
  Box,
  Button,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useViewer } from "@/hooks/useViewer";
import type { PromoCodeRow } from "@/lib/promo/promoCodes";

export default function PromoCodesAdminPage() {
  const { isAdmin, loading: authLoading } = useViewer();
  const [rows, setRows] = useState<PromoCodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newCode, setNewCode] = useState("");
  const [newNote, setNewNote] = useState("");
  const [newMax, setNewMax] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/promo-codes", { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const data = (await res.json()) as { codes: PromoCodeRow[] };
      setRows(data.codes ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load codes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  const create = async () => {
    if (!newCode.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/promo-codes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: newCode.trim(),
          note: newNote.trim() || null,
          maxRedemptions: newMax.trim() ? Number(newMax) : null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not create code.");
      setNewCode("");
      setNewNote("");
      setNewMax("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create code.");
    } finally {
      setBusy(false);
    }
  };

  const mutate = async (code: string, action: string, value?: number | null) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/promo-codes/${encodeURIComponent(code)}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, value }),
      });
      if (!res.ok) throw new Error(`Update failed (${res.status})`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  };

  if (authLoading) {
    return (
      <Box sx={{ p: 4, display: "flex", justifyContent: "center" }}>
        <CircularProgress />
      </Box>
    );
  }
  if (!isAdmin) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography>Not authorized.</Typography>
      </Box>
    );
  }

  return (
    <>
      <Head>
        <title>Promo codes — Admin</title>
      </Head>
      <Box sx={{ maxWidth: 980, mx: "auto", p: { xs: 2, sm: 3 } }}>
        <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>
          Promo codes
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Each redemption grants a user free-forever Premium. max = blank means
          unlimited.
        </Typography>

        {error && (
          <Typography color="error" sx={{ mb: 2, fontSize: "0.85rem" }}>
            {error}
          </Typography>
        )}

        {/* Create */}
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          alignItems={{ sm: "flex-end" }}
          sx={{ mb: 3 }}
        >
          <TextField
            size="small"
            label="New code"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value.toUpperCase())}
          />
          <TextField
            size="small"
            label="Note"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
          />
          <TextField
            size="small"
            label="Max (blank = ∞)"
            value={newMax}
            onChange={(e) => setNewMax(e.target.value.replace(/[^0-9]/g, ""))}
            sx={{ width: 140 }}
          />
          <Button variant="contained" onClick={create} disabled={busy || !newCode.trim()}>
            Create
          </Button>
        </Stack>

        {loading ? (
          <CircularProgress />
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Code</TableCell>
                <TableCell>Note</TableCell>
                <TableCell align="right">Redemptions</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => {
                const revoked = r.revoked_at !== null;
                return (
                  <TableRow key={r.code}>
                    <TableCell sx={{ fontFamily: "monospace", fontWeight: 700 }}>
                      {r.code}
                    </TableCell>
                    <TableCell>{r.note ?? "—"}</TableCell>
                    <TableCell align="right">
                      {r.redemption_count}
                      {r.max_redemptions !== null ? ` / ${r.max_redemptions}` : ""}
                    </TableCell>
                    <TableCell sx={{ color: revoked ? "error.main" : "success.main" }}>
                      {revoked ? "Revoked" : "Active"}
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        color={revoked ? "success" : "error"}
                        disabled={busy}
                        onClick={() => mutate(r.code, revoked ? "unrevoke" : "revoke")}
                      >
                        {revoked ? "Restore" : "Revoke"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                      No promo codes yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Box>
    </>
  );
}
