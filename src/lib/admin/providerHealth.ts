export interface ProviderHealth {
  ok: boolean;
}

export interface ProviderHealthResult {
  ok: boolean;
  providers: {
    anthropic: ProviderHealth;
    openai: ProviderHealth;
  };
}

function parseProvider(value: unknown): ProviderHealth | null {
  if (!value || typeof value !== "object") return null;
  const ok = (value as Record<string, unknown>).ok;
  return typeof ok === "boolean" ? { ok } : null;
}

/** Parse only the sanitized public contract returned by /api/health/llm. */
export function parseProviderHealthResult(
  value: unknown
): ProviderHealthResult | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.ok !== "boolean" ||
    !record.providers ||
    typeof record.providers !== "object"
  ) {
    return null;
  }

  const providers = record.providers as Record<string, unknown>;
  const anthropic = parseProvider(providers.anthropic);
  const openai = parseProvider(providers.openai);
  if (!anthropic || !openai) return null;

  return { ok: record.ok, providers: { anthropic, openai } };
}
