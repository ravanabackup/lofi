// Thin client for the community radio-browser.info directory.
// Used to let users pick a live station instead of hunting for a stream URL.

export interface RadioStation {
  uuid: string;
  name: string;
  url: string; // resolved, playable stream URL (https)
  favicon?: string;
  bitrate?: number;
  codec?: string;
  tags?: string;
  country?: string;
  votes?: number;
  homepage?: string;
}

// Mirrors of the same DB — try each until one responds.
const HOSTS = [
  "https://de1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
  "https://fi1.api.radio-browser.info",
];

async function apiGet<T>(path: string): Promise<T> {
  let lastErr: unknown = null;
  for (const host of HOSTS) {
    try {
      const res = await fetch(host + path, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`radio API ${res.status}`);
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("radio directory unavailable");
}

interface RawStation {
  stationuuid: string;
  name: string;
  url_resolved: string;
  favicon: string;
  bitrate: number;
  codec: string;
  tags: string;
  country: string;
  countrycode: string;
  votes: number;
  homepage: string;
  lastcheckok: boolean;
}

export async function searchStations(opts: {
  tag?: string;
  name?: string;
  limit?: number;
}): Promise<RadioStation[]> {
  const params = new URLSearchParams({
    limit: String(opts.limit ?? 30),
    order: "clickcount",
    reverse: "true",
    hidebroken: "true",
  });
  if (opts.tag) params.set("tag", opts.tag);
  if (opts.name) params.set("name", opts.name);

  const raw = await apiGet<RawStation[]>(`/json/stations/search?${params.toString()}`);

  const seen = new Set<string>();
  return raw
    .filter((s) => s.url_resolved && /^https:\/\//i.test(s.url_resolved))
    .filter((s) => {
      const key = s.name.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((s) => ({
      uuid: s.stationuuid,
      name: s.name.trim() || "Unknown station",
      url: s.url_resolved,
      favicon: s.favicon || undefined,
      bitrate: s.bitrate || undefined,
      codec: s.codec || undefined,
      tags: s.tags || undefined,
      country: s.country || undefined,
      votes: s.votes || undefined,
      homepage: s.homepage || undefined,
    }));
}
