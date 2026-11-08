export interface SafeFetchResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  errorMessage: string | null;
}

/**
 * Performs a fetch and safely parses JSON even if the server returns an HTML error page
 * or drops the connection, preventing uncaught SyntaxError or [object Event] rejections.
 */
export async function safeFetchJson<T>(
  url: string,
  init?: RequestInit
): Promise<SafeFetchResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    return {
      ok: false,
      status: 0,
      data: null,
      errorMessage:
        "Server neodpovídá — zkontroluj připojení nebo v terminálu restartuj npm run dev.",
    };
  }

  let rawText = "";
  try {
    rawText = await res.text();
  } catch {
    return {
      ok: false,
      status: res.status,
      data: null,
      errorMessage: `Nepodařilo se přečíst odpověď serveru (HTTP ${res.status}).`,
    };
  }

  let parsed: T | null = null;
  if (rawText.trim().length > 0) {
    try {
      parsed = JSON.parse(rawText) as T;
    } catch {
      return {
        ok: false,
        status: res.status,
        data: null,
        errorMessage:
          res.status >= 500
            ? `Vnitřní chyba serveru (HTTP ${res.status}) — obnov stránku (Cmd+R) nebo restartuj npm run dev.`
            : `Neočekávaná odpověď serveru (HTTP ${res.status}).`,
      };
    }
  }

  if (!res.ok) {
    const apiError =
      parsed !== null &&
      typeof parsed === "object" &&
      "error" in parsed &&
      typeof (parsed as { error?: unknown }).error === "string"
        ? (parsed as { error: string }).error
        : `Požadavek selhal (HTTP ${res.status}).`;

    return {
      ok: false,
      status: res.status,
      data: parsed,
      errorMessage: apiError,
    };
  }

  return {
    ok: true,
    status: res.status,
    data: parsed,
    errorMessage: null,
  };
}
