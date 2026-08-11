const VALID_TYPES = ['song', 'video', 'artist', 'playlist', 'album'];

app.get('/search', async (req, res) => {
  const query = req.query.q;
  const type = req.query.type;

  if (!query) {
    return res.status(400).json({ error: 'Manca il parametro di ricerca "q"' });
  }

  try {
    const yt = await getYT();
    const filters = {};
    if (type && VALID_TYPES.includes(type)) filters.type = type;

    const raw = await yt.music.search(query, filters);
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

// Endpoint di salute: utile per verificare in un attimo che la function risponda
app.get('/', (req, res) => {
  res.json({ ok: true, message: 'AliceMusic backend attivo. Usa /search?q=...&type=song|artist|playlist|album|video' });
});

// IMPORTANTE: niente app.listen() — su Vercel la funzione viene invocata
// tramite questo export di default.
export default app;
