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

async function getYT() {
  if (!ytInstance) {
    try {
      ytInstance = await Innertube.create({
        lang: 'it',
        location: 'IT',
        retrieve_player: false
      });
    } catch (err) {
      console.error('Errore durante la creazione dell\'istanza Innertube:', err);
      ytInstance = null;
      throw err;
    }
  }
  return ytInstance;
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
  return item?.id || item?.video_id || item?.videoId || item?.playlistId || null;
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
    const contents = node.contents || node.items || node.results || null;
    if (Array.isArray(contents)) {
      contents.forEach(walk);
    }
    
    const id = pickId(node);
    if (id && !seen.has(id)) {
      seen.add(id);
      
      let kind = 'song';
      if (node.type === 'Artist' || node.endpoint?.browse_id?.startsWith('UC')) {
        kind = 'artist';
      } else if (node.type === 'Playlist' || id.startsWith('PL') || node.is_playlist) {
        kind = 'playlist';
      } else if (node.type === 'Album' || node.is_album) {
        kind = 'album';
      }

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

  walk(data);
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
    // Tenta di resettare l'istanza in caso di errore critico di sessione
    ytInstance = null;
    return res.status(500).json({ error: 'Errore interno del server', detail: String(err) });
  }
});

app.get('/api/artist', async (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Manca ID artista' });

  try {
    const yt = await getYT();
    const artistData = await yt.music.getArtist(id);
    const tracks = normalizeShelfResults(artistData);
    return res.json({ tracks });
  } catch (err) {
    console.error('Errore caricamento artista:', err);
    return res.status(500).json({ error: 'Errore interno', detail: String(err) });
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
    return res.status(500).json({ error: 'Errore interno', detail: String(err) });
  }
});

app.get('/api', (req, res) => res.json({ status: 'online', service: 'AliceMusic API' }));
app.get('/', (req, res) => res.json({ status: 'online', service: 'AliceMusic API' }));

export default app;
