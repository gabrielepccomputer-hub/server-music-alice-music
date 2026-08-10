import express from 'express';
import cors from 'cors';
import { Innertube } from 'youtubei.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Abilita CORS per permettere al tuo sito (ospitato altrove) di chiamare questo server
app.use(cors());
app.use(express.json());

let yt = null;

// Inizializza Innertube all'avvio del server
async function initYouTube() {
  try {
    yt = await Innertube.create({ 
      lang: 'it', 
      location: 'IT',
      retrieve_player: false 
    });
    console.log("YouTube.js (Innertube) inizializzato con successo!");
  } catch (error) {
    console.error("Errore nell'inizializzazione di Innertube:", error);
  }
}

initYouTube();

// Endpoint di ricerca separato
app.get('/search', async (req, res) => {
  const query = req.query.q;
  
  if (!query) {
    return res.status(400).json({ error: 'Manca il parametro di ricerca "q"' });
  }

  if (!yt) {
    return res.status(500).json({ error: 'Il server si sta ancora avviando, riprova tra poco.' });
  }

  try {
    const results = await yt.music.search(query);
    return res.json(results);
  } catch (err) {
    console.error("Errore durante la ricerca:", err);
    return res.status(500).json({ error: 'Errore interno del server' });
  }
});

app.listen(PORT, () => {
  console.log(`Server avviato sulla porta ${PORT}`);
});