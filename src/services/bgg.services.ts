import axios from "axios";
import { parseStringPromise } from "xml2js";

const bgg = axios.create({
  baseURL: "https://boardgamegeek.com/xmlapi2",
  timeout: 10000,
  headers: {
    Authorization: `Bearer ${process.env.BGG_API_TOKEN}`,
    Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8",
  },
});

function normalizeName(name: string) {
  return String(name || "")
    .replace(/:.*/g, "")
    .replace(/\(.*\)/g, "")
    .trim();
}

export async function searchBGG(name: string) {
  const query = normalizeName(name);

  const response = await bgg.get("/search", {
    params: {
      query,
      type: "boardgame",
    },
  });

  const json = await parseStringPromise(response.data);
  const items = json?.items?.item;

  if (!items || !items.length) return null;

  return items[0]?.$?.id ?? null;
}

export async function getBGGDetails(id: string | number) {
  const response = await bgg.get("/thing", {
    params: {
      id,
      stats: 1,
    },
  });

  const json = await parseStringPromise(response.data);
  const item = json?.items?.item?.[0];

  if (!item) return null;

  return {
    description: item.description?.[0] || "",
    minPlayers: Number(item.minplayers?.[0]?.$?.value || 1),
    maxPlayers: Number(item.maxplayers?.[0]?.$?.value || 0) || null,
    minTime: Number(item.minplaytime?.[0]?.$?.value || 0),
    maxTime: Number(item.maxplaytime?.[0]?.$?.value || 0) || null,
    minAge: Number(item.minage?.[0]?.$?.value || 0),
  };
}