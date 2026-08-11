import express from 'express';
import cors from 'cors';
import { Innertube } from 'youtubei.js';

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

let ytInstance = null;
let ytInstancePromise = null;

// Evita race conditions se più richieste arrivano contemporaneamente
async function getYT() {
  if (ytInstance) return ytInstance;
  if (ytInstancePromise) return ytInstancePromise;

  ytInstancePromise = (async () => {
    try {
      const instance = await Innertube.create({
        lang: 'it',
        location: 'IT',
        retrieve_player: false
      });
      ytInstance = instance;
      return instance;
    } catch (err) {
      console.error('Errore durante la creazione dell\'istanza Innertube:', err);
      ytInstancePromise = null; // Resetta per permettere un nuovo tentativo
      throw err;
    }
  })();

  return ytInstancePromise;
}

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
      if (best?.url) return best.url.startsWith('//') ? `https:${best.url}` : best.url;
    }
  }
  if (item?.id) return `https://i.ytimg.com/vi/${item.id}/mqdefault.jpg`;
  return '';
}

function pickArtist(item) {
  if (Array.isArray(item?.artists) && item.artists.length) {
    return item.artists.map(a => a?.name).filter(Boolean).join(', ');
  }
  if (item?.author?.name) return item.author.name;
  if (typeof item?.author === 'string') return item.author;
  if (item?.artist?.name) return item.artist.name;
  if (typeof item?.artist === 'string') return item.artist;
  return 'Sconosciuto';
}

function pickTitle(item) {
  if (typeof item?.title === 'string') return item.title;
  if (item?.title?.text) return item.title.text;
  return 'Senza titolo';
}

// Estrae l'ID corretto in base al tipo di contenuto
function pickId(item) {
  if (item?.id) return item.id;
  if (item?.video_id) return item.video_id;
  if (item?.videoId) return item.videoId;
  if (item?.endpoint?.playlist_id) return item.endpoint.playlist_id;
  if (item?.endpoint?.browse_id) return item.endpoint.browse_id;
  if (item?.playlistId) return item.playlistId;
  return null;
}

function normalizeShelfResults(data) {
  const out = [];
  const seen = new Set();
  
  const walk = (node) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    
    const contents = node.contents || node.items || node.results || node.videos || null;
    if (Array.isArray(contents)) {
      contents.forEach(walk);
    }
    
    const id = pickId(node);
    if (id && !seen.has(id)) {
      seen.add(id);
      
      let kind = 'song';
      let isArtist = node.type === 'Artist' || (node.endpoint?.browse_id?.startsWith('UC') && !node.endpoint?.playlist_id);
      let isPlaylist = node.type === 'Playlist' || node.endpoint?.playlist_id || id.startsWith('PL');
      let isAlbum = node.type === 'Album' || node.is_album;

      if (isArtist) kind = 'artist';
      else if (isPlaylist) kind = 'playlist';
      else if (isAlbum) kind = 'album';

      out.push({
        id,
        title: pickTitle(node),
        artist: pickArtist(node),
        thumb: pickThumb(node),
        album: node.album?.name || null,
        duration: node.duration?.text || null,
        kind
      });
    }
  };

  try {
    walk(data);
  } catch (e) {
    console.error("Errore durante normalizeShelfResults:", e);
  }
  return out;
}

const VALID_TYPES = ['song', 'video', 'artist', 'playlist', 'album'];

app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  const type = req.query.type;

  if (!query) {
    return res.status(400).json({ error: 'Manca il parametro di ricerca "q"' });
  }

  try {
    const yt = await getYT();
    const filters = {};
    if (type && VALID_TYPES.includes(type)) {
      filters.type = type;
    }

    // yt.music.search restituisce un oggetto complesso, lo passiamo tutto a normalize
    const raw = await yt.music.search(query, filters);
    const tracks = normalizeShelfResults(raw);

    return res.json({
      query,
      type: filters.type || 'all',
      count: tracks.length,
      tracks
    });
  } catch (err) {
    console.error('Errore durante la ricerca API:', err);
    ytInstance = null; // Resetta sessione in caso di crash
    ytInstancePromise = null;
    return res.status(500).json({ error: 'Errore interno del server', detail: String(err.message || err) });
  }
});

app.get('/api/artist', async (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Manca ID artista' });

  try {
    const yt = await getYT();
    const artistData = await yt.music.getArtist(id);
    
    // getArtist restituisce varie sezioni, ci interessa soprattutto songs
    const tracks = normalizeShelfResults(artistData);
    return res.json({ tracks });
  } catch (err) {
    console.error('Errore caricamento artista:', err);
    ytInstance = null;
    ytInstancePromise = null;
    return res.status(500).json({ error: 'Errore interno', detail: String(err.message || err) });
  }
});

app.get('/api/playlist', async (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Manca ID playlist' });

  try {
    const yt = await getYT();
    const playlistData = await yt.music.getPlaylist(id);
    
    const tracks = normalizeShelfResults(playlistData);
    return res.json({ tracks });
  } catch (err) {
    console.error('Errore caricamento playlist:', err);
    ytInstance = null;
    ytInstancePromise = null;
    return res.status(500).json({ error: 'Errore interno', detail: String(err.message || err) });
  }
});

app.get('/api', (req, res) => res.json({ status: 'online', service: 'AliceMusic API' }));
app.get('/', (req, res) => res.json({ status: 'online', service: 'AliceMusic API' }));

export default app;
