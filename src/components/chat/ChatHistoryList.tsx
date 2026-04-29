"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  IconButton,
  Typography,
  Tooltip,
  CircularProgress,
  TextField,
} from "@mui/material";
import { Icon } from "@iconify/react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import {
  listChats,
  renameChat,
  deleteChat,
  chatTimestampMs,
  type ChatRecord,
} from "@/lib/firestoreChats";

function relativeTime(ms: number): string {
  if (!ms) return "";
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w`;
  const mo = Math.floor(day / 30);
  return `${mo}mo`;
}

interface Props {
  onNavigate?: () => void;
}

export default function ChatHistoryList({ onNavigate }: Props) {
  const { user } = useAuth();
  const router = useRouter();
  const [chats, setChats] = useState<ChatRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const refresh = useCallback(async () => {
    if (!user) {
      setChats([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await listChats();
      setChats(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load chats.");
      setChats([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
    // Refetch when window regains focus so the list reflects new chats
    // created in another tab or by a recent send.
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const openChat = (chatId: string) => {
    void router.push({ pathname: "/analysis", query: { chatId } });
    onNavigate?.();
  };

  const startRename = (chat: ChatRecord) => {
    setEditingId(chat.firestoreId);
    setEditDraft(chat.title);
  };

  const commitRename = async (chatId: string) => {
    const next = editDraft.trim();
    setEditingId(null);
    if (!next) return;
    try {
      await renameChat(chatId, next);
      setChats((prev) =>
        prev
          ? prev.map((c) =>
              c.firestoreId === chatId ? { ...c, title: next, titleSource: "manual" as const } : c
            )
          : prev
      );
    } catch (err) {
      console.error(err);
    }
  };

  const removeChat = async (chatId: string) => {
    if (!confirm("Delete this chat?")) return;
    setChats((prev) =>
      prev ? prev.filter((c) => c.firestoreId !== chatId) : prev
    );
    try {
      await deleteChat(chatId);
      // If the user was viewing the deleted chat, clear the URL.
      if (router.query.chatId === chatId) {
        void router.push({ pathname: "/analysis" });
      }
    } catch (err) {
      console.error(err);
      void refresh();
    }
  };

  if (!user) return null;

  return (
    <Box sx={{ px: 1, py: 0.5, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 1, mt: 1, mb: 0.5 }}>
        <Typography variant="overline" color="text.secondary">
          Chat history
        </Typography>
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={() => void refresh()} disabled={loading}>
            <Icon icon="mdi:refresh" height="1em" />
          </IconButton>
        </Tooltip>
      </Box>

      {loading && !chats && (
        <Box sx={{ display: "flex", justifyContent: "center", p: 2 }}>
          <CircularProgress size={20} />
        </Box>
      )}

      {error && (
        <Typography variant="caption" color="error" sx={{ px: 1 }}>
          {error}
        </Typography>
      )}

      {chats && chats.length === 0 && !loading && (
        <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
          No chats yet. Start one in Analysis to see it here.
        </Typography>
      )}

      {chats && chats.length > 0 && (
        <List dense disablePadding sx={{ overflow: "auto" }}>
          {chats.map((chat) => {
            const isActive = router.query.chatId === chat.firestoreId;
            const ts = chatTimestampMs(chat.updatedAt);
            const isEditing = editingId === chat.firestoreId;
            return (
              <ListItem
                key={chat.firestoreId}
                disablePadding
                sx={{
                  "& .chat-actions": { opacity: 0, transition: "opacity 100ms" },
                  "&:hover .chat-actions": { opacity: 1 },
                }}
                secondaryAction={
                  !isEditing && (
                    <Box className="chat-actions" sx={{ display: "flex" }}>
                      <Tooltip title="Rename">
                        <IconButton
                          size="small"
                          edge="end"
                          onClick={(e) => {
                            e.stopPropagation();
                            startRename(chat);
                          }}
                        >
                          <Icon icon="mdi:pencil-outline" height="0.9em" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          edge="end"
                          onClick={(e) => {
                            e.stopPropagation();
                            void removeChat(chat.firestoreId);
                          }}
                        >
                          <Icon icon="mdi:trash-can-outline" height="0.9em" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  )
                }
              >
                {isEditing ? (
                  <Box sx={{ width: "100%", px: 1, py: 0.5 }}>
                    <TextField
                      size="small"
                      autoFocus
                      fullWidth
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      onBlur={() => void commitRename(chat.firestoreId)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void commitRename(chat.firestoreId);
                        } else if (e.key === "Escape") {
                          setEditingId(null);
                        }
                      }}
                      inputProps={{ maxLength: 80 }}
                    />
                  </Box>
                ) : (
                  <ListItemButton
                    selected={isActive}
                    onClick={() => openChat(chat.firestoreId)}
                    sx={{ pr: 8 }}
                  >
                    <ListItemText
                      primary={chat.title || "Untitled"}
                      primaryTypographyProps={{
                        noWrap: true,
                        fontSize: "0.875rem",
                        fontWeight: isActive ? 600 : 500,
                      }}
                      secondary={
                        <Box component="span" sx={{ display: "flex", justifyContent: "space-between" }}>
                          <Typography
                            component="span"
                            variant="caption"
                            color="text.secondary"
                            sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}
                          >
                            {chat.preview || `${chat.messageCount} message${chat.messageCount === 1 ? "" : "s"}`}
                          </Typography>
                          <Typography component="span" variant="caption" color="text.secondary">
                            {relativeTime(ts)}
                          </Typography>
                        </Box>
                      }
                    />
                  </ListItemButton>
                )}
              </ListItem>
            );
          })}
        </List>
      )}
    </Box>
  );
}
