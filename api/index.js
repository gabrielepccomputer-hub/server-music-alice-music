import express from 'express';
import cors from 'cors';
import { Innertube } from 'youtubei.js';

const app = express();

app.use(cors());
app.use(express.json());

let yt = null;
async function getYT() {
  if (!yt) {
    yt = await Innertube.create({ lang: 'it', location: 'IT', retrieve_player: false });
  }
  return yt;
}

// Funzione di normalizzazione dei risultati di YouTube
function pickThumb(item) {
  const candidates = [
    item?.thumbnail?.contents,
    item?.thumbnail?.thumbnails,
    Array.isArray(item?.thumbnail) ? item.thumbnail : null,
    item?.thumbnails,
    item?.author?.thumbnails,
  ].filter(Boolean);
  for (const arr of candidates) {
    if (Array.isArray(arr) && arr.length) {
      const best = arr[arr.length - 1];
      if (best?.url) return best.url;
    }
  }
  if (item?.id) return `https://i.ytimg.com/vi/${item.id}/mqdefault.jpg`;
  return '';
}

function pickArtist(item) {
  if (Array.isArray(item?.artists) && item.artists.length) {
    return item.artists.map(a => a?.name).filter(Boolean).join(', ');
  }
  if (item?.artist?.name) return item.artist.name;
  if (typeof item?.artist === 'string') return item.artist;
  if (item?.author?.name) return item.author.name;
  if (typeof item?.author === 'string') return item.author;
  return 'Sconosciuto';
}

function pickTitle(item) {
  if (typeof item?.title === 'string') return item.title;
  if (item?.title?.text) return item.title.text;
  return 'Senza titolo';
}

function pickId(item) {
  return item?.id || item?.video_id || item?.videoId || null;
}

function normalizeShelfResults(data) {
  const out = [];
  const seen = new Set();
  const walk = (node) => {
    if (!node) return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const contents = node.contents || node.items || null;
    if (Array.isArray(contents)) contents.forEach(walk);
    const id = pickId(node);
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push({
        id,
        title: pickTitle(node),
        artist: pickArtist(node),
        thumb: pickThumb(node),
        album: node.album?.name || null,
        duration: node.duration?.text || null,
        kind: node.type || 'song'
      });
    }
  };
  walk(data?.results || data?.contents || data);
  return out;
}

const VALID_TYPES = ['song', 'video', 'artist', 'playlist', 'album'];

// Endpoint principale aggiornato con il prefisso /api/search richiesto dal frontend
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  const type = req.query.type;

  if (!query) {
    return res.status(400).json({ error: 'Manca il parametro di ricerca "q"' });
  }

  try {
    const ytInstance = await getYT();
    const filters = {};
    if (type && VALID_TYPES.includes(type)) filters.type = type;

    const raw = await ytInstance.music.search(query, filters);
    const tracks = normalizeShelfResults(raw);

    return res.json({
      query,
      type: filters.type || 'all',
      count: tracks.length,
      tracks
    });
  } catch (err) {
    console.error('Errore durante la ricerca:', err);
    return res.status(500).json({
      error: 'Errore interno del server',
      detail: String(err?.message || err)
    });
  }
});

// Endpoint di stato per verificare che la function risponda
app.get('/api', (req, res) => {
  res.json({ ok: true, message: 'AliceMusic backend attivo.' });
});

app.get('/', (req, res) => {
  res.json({ ok: true, message: 'AliceMusic backend attivo.' });
});

export default app;
