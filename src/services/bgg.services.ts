import axios from "axios";
import { parseStringPromise } from "xml2js";

const BGG_API_TOKEN = process.env.BGG_API_TOKEN || "";

const bgg = axios.create({
  baseURL: "https://boardgamegeek.com/xmlapi2",
  timeout: 10000,
  headers: {
    Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8",
    ...(BGG_API_TOKEN
      ? { Authorization: `Bearer ${BGG_API_TOKEN}` }
      : {}),
  },
});

function normalizeName(name: string) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[:\-–|]/g, " ")
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(deluxe|edition|expansion|promo|pack|english|portuguese)\b/gi, " ")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function levenshtein(a: string, b: string) {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

function similarity(a: string, b: string) {
  if (!a && !b) return 1;
  if (!a || !b) return 0;

  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);

  if (maxLen === 0) return 1;
  return 1 - dist / maxLen;
}

type BGGSearchCandidate = {
  id: string;
  primaryName: string;
  allNames: string[];
  yearPublished: number | null;
  score: number;
};

function extractNames(nameField: any): { primaryName: string; allNames: string[] } {
  const arr = Array.isArray(nameField) ? nameField : [];

  const allNames = arr
    .map((n: any) => n?.$?.value)
    .filter(Boolean);

  const primaryName =
    arr.find((n: any) => n?.$?.type === "primary")?.$?.value ||
    allNames[0] ||
    "";

  return { primaryName, allNames };
}

function scoreCandidate(params: {
  query: string;
  queryYear?: number | null;
  candidateName: string;
  candidateAltNames: string[];
  candidateYear: number | null;
}) {
  const q = normalizeName(params.query);
  const primary = normalizeName(params.candidateName);
  const all = params.candidateAltNames.map(normalizeName);

  let score = 0;

  if (primary === q) score += 100;
  if (all.includes(q)) score += 80;

  const primarySimilarity = similarity(q, primary);
  score += Math.round(primarySimilarity * 60);

  const bestAltSimilarity = all.length
    ? Math.max(...all.map((name) => similarity(q, name)))
    : 0;

  score += Math.round(bestAltSimilarity * 30);

  if (params.queryYear && params.candidateYear) {
    const diff = Math.abs(params.queryYear - params.candidateYear);
    if (diff === 0) score += 20;
    else if (diff === 1) score += 12;
    else if (diff <= 3) score += 5;
  }

  const queryWords = new Set(q.split(" ").filter(Boolean));
  const primaryWords = new Set(primary.split(" ").filter(Boolean));

  let commonWords = 0;
  for (const word of queryWords) {
    if (primaryWords.has(word)) commonWords++;
  }

  score += commonWords * 5;

  return score;
}

export async function searchBGG(
  name: string,
  options?: { year?: number | null }
): Promise<{ id: string; confidence: number; primaryName: string } | null> {
  if (!BGG_API_TOKEN) {
    console.warn("BGG_API_TOKEN não configurado. Busca BGG desativada.");
    return null;
  }

  const query = normalizeName(name);
  if (!query) return null;

  const response = await bgg.get("/search", {
    params: {
      query,
      type: "boardgame",
    },
  });

  const json = await parseStringPromise(response.data);
  const rawItems = json?.items?.item;

  if (!rawItems || !rawItems.length) return null;

  const items = Array.isArray(rawItems) ? rawItems : [rawItems];

  const candidates: BGGSearchCandidate[] = items.map((item: any) => {
    const { primaryName, allNames } = extractNames(item.name);
    const yearPublished = Number(item.yearpublished?.[0]?.$?.value || 0) || null;

    const score = scoreCandidate({
      query: name,
      queryYear: options?.year ?? null,
      candidateName: primaryName,
      candidateAltNames: allNames,
      candidateYear: yearPublished,
    });

    return {
      id: item?.$?.id,
      primaryName,
      allNames,
      yearPublished,
      score,
    };
  });

  candidates.sort((a, b) => b.score - a.score);

  const best = candidates[0];
  if (!best?.id) return null;

  return {
    id: best.id,
    confidence: best.score,
    primaryName: best.primaryName,
  };
}

export async function getBGGDetails(id: string | number) {
  if (!BGG_API_TOKEN) {
    console.warn("BGG_API_TOKEN não configurado. Detalhes BGG desativados.");
    return null;
  }

  const response = await bgg.get("/thing", {
    params: {
      id,
      stats: 1,
    },
  });

  const json = await parseStringPromise(response.data);
  const item = json?.items?.item?.[0];

  if (!item) return null;

  const { primaryName, allNames } = extractNames(item.name);
  const yearPublished = Number(item.yearpublished?.[0]?.$?.value || 0) || null;

  return {
    id: String(id),
    primaryName,
    allNames,
    yearPublished,
    description: item.description?.[0] || "",
    minPlayers: Number(item.minplayers?.[0]?.$?.value || 1),
    maxPlayers: Number(item.maxplayers?.[0]?.$?.value || 0) || null,
    minTime: Number(item.minplaytime?.[0]?.$?.value || 0),
    maxTime: Number(item.maxplaytime?.[0]?.$?.value || 0) || null,
    minAge: Number(item.minage?.[0]?.$?.value || 0),
  };
}