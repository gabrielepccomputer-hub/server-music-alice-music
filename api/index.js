import express from 'express';
import cors from 'cors';
import { Innertube } from 'youtubei.js';

const app = express();

// Abilita CORS per permettere al tuo sito (ospitato altrove) di chiamare questo server
app.use(cors());
app.use(express.json());

// ---------------------------------------------
// Init "pigra" e cache-ata di Innertube.
// Su Vercel una funzione serverless NON tiene uno stato persistente tra
// invocazioni "fredde": non possiamo inizializzare Innertube una volta sola
// all'avvio del processo come si farebbe con un server tradizionale.
// Con questo pattern:
//  - la prima richiesta dopo un cold start avvia l'inizializzazione e ASPETTA
//    che finisca prima di rispondere (niente più errore "si sta avviando")
//  - le richieste successive, finché l'istanza resta "calda", riusano la
//    stessa istanza già pronta (molto più veloce)
// ---------------------------------------------
let ytPromise = null;
function getYT() {
  if (!ytPromise) {
    ytPromise = Innertube.create({
      lang: 'it',
      location: 'IT',
      retrieve_player: false
    }).catch((err) => {
      // Se l'init fallisce, resetta la cache così il prossimo tentativo riprova
      ytPromise = null;
      throw err;
    });
  }
  return ytPromise;
}

app.get('/search', async (req, res) => {
  const query = req.query.q;

  if (!query) {
    return res.status(400).json({ error: 'Manca il parametro di ricerca "q"' });
  }

  try {
    const yt = await getYT();
    const results = await yt.music.search(query);
    return res.json(results);
  } catch (err) {
    console.error('Errore durante la ricerca:', err);
    return res.status(500).json({ error: 'Errore interno del server', detail: String(err?.message || err) });
  }
});

// Piccolo endpoint di salute utile per capire subito se la function risponde
app.get('/', (req, res) => {
  res.json({ ok: true, message: 'AliceMusic backend attivo. Usa /search?q=...' });
});

// IMPORTANTE: niente app.listen() qui.
// Su Vercel la funzione viene invocata tramite l'export di default.
export default app;
