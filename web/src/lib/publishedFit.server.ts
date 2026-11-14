/**
 * Build-time read of the published fit for server components.
 *
 * The browser reads params.json through getParams() in queries.ts; a server
 * component cannot fetch a relative URL at build time, so it reads the same
 * committed file from public/data on disk. This module uses node:fs and must
 * never be imported from a client component. Parquet reads stay in queries.ts.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { CountryFit, Params } from "@/lib/types";

type DeepPartial<T> = T extends (infer U)[]
  ? DeepPartial<U>[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

/**
 * A country's published fit as it may arrive: every field optional, because
 * later fits can omit fields or add ones such as `fit_source: "pooled"`.
 */
export type LooseCountryFit = DeepPartial<CountryFit> & {
  fit_source?: string;
  kappa_source?: string;
};

export type LooseParams = DeepPartial<Omit<Params, "countries">> & {
  countries?: Record<string, LooseCountryFit>;
};

const PUBLIC_DIR = path.join(process.cwd(), "public");

export type LoadResult =
  | { ok: true; params: LooseParams }
  | { ok: false; error: string };

export async function loadPublishedFit(): Promise<LoadResult> {
  try {
    const text = await readFile(path.join(PUBLIC_DIR, "data", "params.json"), "utf8");
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "params.json is not a JSON object" };
    }
    return { ok: true, params: parsed as LooseParams };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface Figure {
  src: string;
  width: number;
  height: number;
}

/** PNG intrinsic size from the IHDR chunk (bytes 16-23, big-endian). */
function pngSize(buf: Buffer): { width: number; height: number } | null {
  const sig = "89504e470d0a1a0a";
  if (buf.length < 24 || buf.subarray(0, 8).toString("hex") !== sig) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** The figures committed under public/figures, keyed by file name. */
export async function listFigures(): Promise<Map<string, Figure>> {
  const dir = path.join(PUBLIC_DIR, "figures");
  const out = new Map<string, Figure>();
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return out;
  }
  for (const name of names.filter((n) => n.endsWith(".png")).sort()) {
    const size = pngSize(await readFile(path.join(dir, name)));
    if (size) out.set(name, { src: `/figures/${name}`, ...size });
  }
  return out;
}
