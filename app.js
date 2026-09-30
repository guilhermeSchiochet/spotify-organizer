'use strict';

/* =====================================================================
   Organizador de Curtidas — organiza as "Músicas Curtidas" do Spotify
   em playlists. Roda 100% no navegador (Authorization Code + PKCE).
   Endpoints conforme as mudanças da Web API de fevereiro/2026:
   POST /me/playlists, /playlists/{id}/items, GET /artists/{id}.
   ===================================================================== */

const API = 'https://api.spotify.com/v1';
const ACCOUNTS = 'https://accounts.spotify.com';
const SCOPES = [
  'user-library-read',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-private',
  'playlist-modify-public',
].join(' ');

const LS = {
  client: 'so_client_id',
  token: 'so_token',
  verifier: 'so_verifier',
  state: 'so_state',
  library: 'so_library',
  genres: 'so_artist_genres',
  trackGenres: 'so_track_genres',
  redirect: 'so_redirect_uri',
  spotifyGenresOff: 'so_spotify_genres_off',
  prefs: 'so_prefs',
};

const MODE_LABEL = {
  genre: 'por gênero',
  genreDetail: 'por gênero detalhado',
  artist: 'por artista',
  decade: 'por década de lançamento',
  year: 'por ano de lançamento',
  added: 'por ano em que curti',
};

/* ---------------- utilidades ---------------- */

const $ = (sel) => document.querySelector(sel);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (n) => n.toLocaleString('pt-BR');
const norm = (s) => s.trim().toLocaleLowerCase('pt-BR');

const store = {
  get(k, fallback = null) {
    try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch { return false; }
  },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignora */ } },
};

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function titleCase(s) {
  return s.replace(/(^|[\s\-/])(\p{L})/gu, (m, sep, ch) => sep + ch.toLocaleUpperCase('pt-BR'));
}

let toastTimer;
function toast(msg, ms = 3500) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

function timeAgo(ts) {
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return 'atualizado agora';
  if (min < 60) return `atualizado há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `atualizado há ${h} h`;
  return `atualizado em ${new Date(ts).toLocaleDateString('pt-BR')}`;
}

/* ---------------- autenticação (PKCE) ---------------- */

// Endereço padrão desta página, que é o que deve ser cadastrado no painel do Spotify.
function defaultRedirectUri() {
  return location.origin + location.pathname.replace(/index\.html$/, '');
}

// O Spotify exige que o redirect_uri seja idêntico ao cadastrado; se o usuário cadastrou
// uma variação que ainda aponta para esta página (ex.: sem a "/" final), usamos a dele.
function redirectUri() {
  return store.get(LS.redirect) || defaultRedirectUri();
}

function pointsToThisPage(uri) {
  try {
    const u = new URL(uri);
    return u.origin === location.origin && u.pathname === new URL(defaultRedirectUri()).pathname;
  } catch { return false; }
}

function clientId() {
  return store.get(LS.client, '');
}

function randomString(len) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

async function sha256base64url(text) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function login() {
  const id = $('#clientId').value.trim();
  if (!/^[a-z0-9]{32}$/i.test(id)) {
    showSetupError('O Client ID tem 32 caracteres (letras e números). Confira se copiou certinho.');
    return;
  }
  const override = $('#redirectOverride').value.trim();
  if (override && !pointsToThisPage(override)) {
    showSetupError(`"${override}" não aponta para esta página. Cadastre no painel do Spotify exatamente ${defaultRedirectUri()} e deixe o campo vazio.`);
    return;
  }
  if (override) store.set(LS.redirect, override);
  else store.del(LS.redirect);
  store.set(LS.client, id);
  const verifier = randomString(64);
  const state = randomString(16);
  store.set(LS.verifier, verifier);
  store.set(LS.state, state);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: id,
    scope: SCOPES,
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: await sha256base64url(verifier),
    state,
  });
  location.href = `${ACCOUNTS}/authorize?${params}`;
}

let token = store.get(LS.token);

async function tokenRequest(params) {
  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.error || `Falha na autenticação (${res.status})`);
  token = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || token?.refresh_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
  };
  store.set(LS.token, token);
}

async function handleCallback(params) {
  const expected = store.get(LS.state);
  store.del(LS.state);
  if (params.get('error')) {
    throw new Error(params.get('error') === 'access_denied'
      ? 'Você cancelou a autorização no Spotify.'
      : `O Spotify recusou o login: ${params.get('error')}`);
  }
  if (!expected || params.get('state') !== expected) throw new Error('Resposta de login inválida. Tente conectar de novo.');
  await tokenRequest({
    grant_type: 'authorization_code',
    code: params.get('code'),
    redirect_uri: redirectUri(),
    client_id: clientId(),
    code_verifier: store.get(LS.verifier),
  });
  store.del(LS.verifier);
}

let refreshing = null;
async function ensureToken(force = false) {
  if (!token) throw new AuthError();
  if (!force && Date.now() < token.expires_at) return;
  if (!refreshing) {
    refreshing = tokenRequest({ grant_type: 'refresh_token', refresh_token: token.refresh_token, client_id: clientId() })
      .catch(() => { throw new AuthError(); })
      .finally(() => { refreshing = null; });
  }
  await refreshing;
}

class AuthError extends Error {
  constructor() { super('Sua sessão expirou. Conecte de novo.'); }
}
class ApiError extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}

function logout(message) {
  token = null;
  store.del(LS.token);
  store.del(LS.library);
  showSetup(message);
}

/* ---------------- chamadas à API ---------------- */

async function api(path, { method = 'GET', body } = {}) {
  const url = path.startsWith('http') ? path : API + path;
  let refreshed = false;
  for (let attempt = 0; attempt < 8; attempt++) {
    await ensureToken();
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      await sleep(1500 * (attempt + 1)); // falha de rede: tenta de novo
      continue;
    }
    if (res.status === 401 && !refreshed) {
      refreshed = true;
      await ensureToken(true);
      continue;
    }
    if (res.status === 429) {
      const wait = Math.max(1, Number(res.headers.get('Retry-After')) || 3);
      toast(`O Spotify pediu uma pausa. Continuando em ${wait}s…`, Math.min(wait * 1000, 8000));
      await sleep(wait * 1000 + 300);
      continue;
    }
    if (res.status >= 500) {
      await sleep(1000 * (attempt + 1));
      continue;
    }
    if (!res.ok) {
      let msg = res.statusText;
      try { msg = (await res.json()).error?.message || msg; } catch { /* sem corpo */ }
      if (res.status === 401) throw new AuthError();
      throw new ApiError(res.status, msg);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }
  throw new Error('O Spotify não respondeu depois de várias tentativas. Tente mais tarde.');
}

async function getAll(path) {
  const out = [];
  let url = path;
  while (url) {
    const page = await api(url);
    out.push(...page.items);
    url = page.next;
  }
  return out;
}

/* ---------------- estado ---------------- */

let me = null;
const LIBRARY_VERSION = 2; // aumente quando mudar o formato salvo das faixas
let library = store.get(LS.library); // { v, tracks: [...], at }
let byId = new Map();
let groups = [];          // [{ id, label, name, ids: [], include }]
let currentMode = 'genre';
let busy = false;
let cancelRequested = false;

function indexLibrary() {
  byId = new Map((library?.tracks || []).map((t) => [t.id, t]));
}

function slimTrack(t, addedAt) {
  const imgs = t.album?.images || [];
  return {
    id: t.id,
    uri: t.uri,
    n: t.name,
    a: (t.artists || []).map((x) => [x.id, x.name]),
    al: t.album?.name || '',
    rd: t.album?.release_date || '',
    img: (imgs[imgs.length - 1] || imgs[0] || {}).url || '',
    ad: addedAt,
  };
}

/* ---------------- progresso / trava ---------------- */

function setBusy(on) {
  busy = on;
  for (const id of ['#reloadBtn', '#generateBtn', '#createBtn', '#logoutBtn']) $(id).disabled = on;
}

function progress(label, done, total, cancellable = false) {
  $('#progress').hidden = false;
  $('#progressLabel').textContent = label;
  $('#progressBar').style.width = total ? `${Math.min(100, (done / total) * 100)}%` : '0%';
  $('#cancelBtn').hidden = !cancellable;
}

function progressDone() {
  $('#progress').hidden = true;
  $('#cancelBtn').hidden = true;
}

function handleError(e) {
  console.error(e);
  if (e instanceof AuthError) { logout(e.message); return; }
  toast(e.message || 'Algo deu errado.', 6000);
}

/* ---------------- carregar curtidas ---------------- */

async function loadLibrary() {
  const tracks = [];
  let url = '/me/tracks?limit=50';
  progress('Lendo suas músicas curtidas…', 0, 0);
  while (url) {
    const page = await api(url);
    for (const it of page.items) {
      const t = it.track || it.item;
      if (!t || !t.id || t.is_local) continue;
      tracks.push(slimTrack(t, it.added_at));
    }
    progress(`Lendo suas músicas curtidas… ${fmt(tracks.length)} de ${fmt(page.total)}`, tracks.length, page.total);
    url = page.next;
  }
  library = { v: LIBRARY_VERSION, tracks, at: Date.now() };
  if (!store.set(LS.library, library)) console.warn('Biblioteca grande demais para o cache local; será recarregada na próxima visita.');
  indexLibrary();
  progressDone();
  renderLibrary();
}

function renderLibrary() {
  const tracks = library?.tracks || [];
  const artists = new Set(tracks.map((t) => t.a[0]?.[0]).filter(Boolean));
  $('#statTracks').textContent = fmt(tracks.length);
  $('#statArtists').textContent = fmt(artists.size);
  $('#statUpdated').textContent = library ? timeAgo(library.at) : 'nunca carregado';
}

/* ---------------- gêneros ---------------- */

// O Spotify quase não informa mais gêneros para apps em modo de desenvolvimento, então
// o gênero é descoberto em camadas, do melhor para o pior:
//   1. Spotify  — GET /artists/{id} (se vier vazio para os primeiros 30 artistas, desistimos dele)
//   2. Deezer   — acha o artista pela própria música curtida, faz uma votação com os gêneros
//                 de todos os álbuns dele e ainda identifica o álbum exato de cada música
//   3. MusicBrainz — tags da comunidade, só para quem o Deezer não conhece
// Tudo fica em cache no navegador, então isso só é lento na primeira vez.

const DEEZER = 'https://api.deezer.com';
const DEEZER_GENRES = {}; // id -> nome (ex.: 80 -> "Sertanejo")
const BR_DEEZER = /sertanejo|mpb|funk brasileiro|samba\/pagode|ax[eé]\/forr[oó]|brazilian|brasileira/i;

// "Marília Mendonça" -> "mariliamendonca"
function simplify(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}
// "Infiel - Ao Vivo (Remasterizado)" -> "Infiel"
function baseTitle(s) {
  const b = (s || '').replace(/\s*[([].*?[)\]]/g, '').replace(/\s+-\s+.*$/, '').trim();
  return b || s || '';
}

async function pool(items, concurrency, fn) {
  const queue = [...items];
  const worker = async () => { while (queue.length && !cancelRequested) await fn(queue.shift()); };
  await Promise.all(Array.from({ length: concurrency }, worker));
}

// O Deezer não libera CORS, mas aceita JSONP. Limite deles: 50 chamadas a cada 5s.
let jsonpSeq = 0;
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = `__dz${++jsonpSeq}`;
    const script = document.createElement('script');
    const cleanup = () => { clearTimeout(timer); window[cb] = () => {}; script.remove(); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('O Deezer não respondeu.')); }, 15000);
    window[cb] = (data) => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error('Não consegui acessar o Deezer.')); };
    script.src = `${url}${url.includes('?') ? '&' : '?'}output=jsonp&callback=${cb}`;
    document.head.appendChild(script);
  });
}

const dzCalls = [];
async function dzThrottle() {
  for (;;) {
    const now = Date.now();
    while (dzCalls.length && now - dzCalls[0] > 5000) dzCalls.shift();
    if (dzCalls.length < 40) { dzCalls.push(now); return; }
    await sleep(5050 - (now - dzCalls[0]));
  }
}

async function deezer(path) {
  for (let attempt = 0; attempt < 5; attempt++) {
    await dzThrottle();
    let data;
    try { data = await jsonp(DEEZER + path); }
    catch (e) { if (attempt === 4) throw e; await sleep(1500); continue; }
    if (data?.error) {
      if (data.error.code === 4) { await sleep(5000); continue; } // cota excedida
      return null;
    }
    return data;
  }
  return null;
}

async function loadDeezerGenres() {
  if (Object.keys(DEEZER_GENRES).length) return;
  const r = await deezer('/genre');
  for (const g of r?.data || []) if (g.id > 0) DEEZER_GENRES[g.id] = g.name; // 0 = "Todos"
}

// Encontra o artista no Deezer usando as músicas dele que você curtiu (evita perfis duplicados).
async function findDeezerArtist(name, tracks) {
  const want = simplify(name);
  for (const t of tracks.slice(0, 3)) {
    const title = baseTitle(t.n);
    let r = await deezer(`/search?q=${encodeURIComponent(`artist:"${name}" track:"${title}"`)}&limit=10`);
    if (!r?.data?.length) r = await deezer(`/search?q=${encodeURIComponent(`${name} ${title}`)}&limit=10`);
    const hit = r?.data?.find((x) => simplify(x.artist?.name) === want);
    if (hit) return hit.artist.id;
  }
  // Nenhuma música bateu: busca pelo nome e fica com o perfil de mesmo nome com mais fãs.
  const r = await deezer(`/search/artist?q=${encodeURIComponent(name)}&limit=10`);
  const same = (r?.data || []).filter((a) => simplify(a.name) === want).sort((a, b) => (b.nb_fan || 0) - (a.nb_fan || 0));
  return same[0]?.id || null;
}

// Votação com os gêneros de todos os álbuns do artista no Deezer.
async function deezerProfile(dzId, name) {
  const r = await deezer(`/artist/${dzId}/albums?limit=100`);
  const albums = r?.data || [];
  // O Deezer classifica funk carioca como "Soul & Funk"; corrigimos quando o artista é brasileiro.
  const brazilian = /^(mc|dj)\s/i.test(name) || albums.some((a) => BR_DEEZER.test(DEEZER_GENRES[a.genre_id] || ''));
  const counts = new Map();
  const byAlbum = {};
  let known = 0;
  for (const a of albums) {
    let g = DEEZER_GENRES[a.genre_id];
    if (!g) continue;
    if (brazilian && /soul\s*&\s*funk/i.test(g)) g = 'Funk brasileiro';
    counts.set(g, (counts.get(g) || 0) + 1);
    byAlbum[simplify(baseTitle(a.title))] = g;
    known++;
  }
  const votes = [...counts]
    .map(([g, c]) => [g, +((3 * c) / known).toFixed(2)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  return { votes, byAlbum };
}

// MusicBrainz: sem chave, CORS liberado, mas no máximo 1 chamada por segundo.
let mbLast = 0;
async function musicbrainzTags(name, brazilianHint) {
  const want = simplify(name);
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = mbLast + 1100 - Date.now();
    if (wait > 0) await sleep(wait);
    mbLast = Date.now();
    let res;
    try {
      res = await fetch(`https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(`artist:"${name}"`)}&limit=5&fmt=json`);
    } catch { await sleep(2000); continue; }
    if (res.status === 503 || res.status === 429) { await sleep(3000); continue; }
    if (!res.ok) return [];
    const data = await res.json();
    const a = (data.artists || []).find((x) => simplify(x.name) === want && x.score >= 90);
    const tags = (a?.tags || []).filter((t) => t.count > 0).sort((x, y) => y.count - x.count).slice(0, 10);
    const max = tags[0]?.count || 1;
    // "funk" de artista brasileiro é funk carioca, não funk americano
    const brazilian = brazilianHint || tags.some((t) => /brazil|brasil|\bmpb\b/i.test(t.name));
    return tags.map((t) => [brazilian && /^funk$/i.test(t.name) ? 'funk brasileiro' : t.name, +((2 * t.count) / max).toFixed(2)]);
  }
  throw new Error('MusicBrainz indisponível');
}

// "Pop" no Deezer costuma ser rótulo genérico de gravadora; e um empate apertado também é pouco confiável.
const isGenericPop = (g) => /^pop$/i.test(g);
function deezerIsVague(votes) {
  const [top, second] = votes;
  return isGenericPop(top[0]) || (second && top[1] - second[1] < 1);
}

function loadGenreCache() {
  const raw = store.get(LS.genres, {});
  // formato antigo: artistId -> [gêneros do Spotify]
  for (const id in raw) if (Array.isArray(raw[id])) raw[id] = { s: raw[id] };
  return raw;
}

async function ensureGenres() {
  const artists = loadGenreCache();          // spotifyArtistId -> { s: [...], dz: [[g, peso]], mb: [[g, peso]] }
  const tracks = store.get(LS.trackGenres, {}); // trackId -> gênero do álbum no Deezer
  const byArtist = new Map();
  for (const t of library.tracks) {
    const [id, name] = t.a[0] || [];
    if (!id) continue;
    if (!byArtist.has(id)) byArtist.set(id, { name, tracks: [] });
    byArtist.get(id).tracks.push(t);
  }
  const ids = [...byArtist.keys()];
  const has = (id, k) => artists[id]?.[k]?.length > 0;
  const save = () => { store.set(LS.genres, artists); store.set(LS.trackGenres, tracks); };
  cancelRequested = false;

  try {
    // 1) Spotify
    let spotifyOff = store.get(LS.spotifyGenresOff, false);
    const needSpotify = ids.filter((id) => !artists[id]?.s);
    if (!spotifyOff && needSpotify.length) {
      let done = 0, empty = 0;
      await pool(needSpotify, 3, async (id) => {
        if (spotifyOff) return;
        let genres = [];
        try {
          genres = (await api(`/artists/${id}`))?.genres || [];
        } catch (e) {
          if (e instanceof ApiError && e.status === 403) { spotifyOff = true; return; }
          if (!(e instanceof ApiError && (e.status === 404 || e.status === 400))) throw e;
        }
        artists[id] = { ...artists[id], s: genres };
        done++;
        if (!genres.length) empty++;
        if (done >= 30 && empty === done) spotifyOff = true;
        progress(`Consultando gêneros no Spotify… ${fmt(done)} de ${fmt(needSpotify.length)}`, done, needSpotify.length, true);
      });
      if (spotifyOff) store.set(LS.spotifyGenresOff, true);
    }

    // 2) Deezer
    const needDeezer = ids.filter((id) => !has(id, 's') && !artists[id]?.dz);
    if (needDeezer.length && !cancelRequested) {
      await loadDeezerGenres();
      let done = 0;
      await pool(needDeezer, 4, async (id) => {
        const { name, tracks: list } = byArtist.get(id);
        try {
          const dzId = await findDeezerArtist(name, list);
          let votes = [];
          if (dzId) {
            const profile = await deezerProfile(dzId, name);
            votes = profile.votes;
            for (const t of list) {
              const g = profile.byAlbum[simplify(baseTitle(t.al))];
              if (g) tracks[t.id] = g;
            }
          }
          artists[id] = { ...artists[id], dz: votes };
        } catch { /* Deezer fora do ar: tenta de novo numa próxima vez */ }
        done++;
        progress(`Pesquisando gêneros no Deezer… ${fmt(done)} de ${fmt(needDeezer.length)} artistas (só na primeira vez)`, done, needDeezer.length, true);
        if (done % 20 === 0) save();
      });
    }

    // 3) MusicBrainz, para quem continua sem nada ou ficou num empate duvidoso
    const needMb = ids.filter((id) => !has(id, 's') && !artists[id]?.mb && (!has(id, 'dz') || deezerIsVague(artists[id].dz)));
    if (needMb.length && !cancelRequested) {
      let done = 0;
      await pool(needMb, 1, async (id) => {
        const { name } = byArtist.get(id);
        const brazilianHint = /^(mc|dj)\s/i.test(name) || (artists[id]?.dz || []).some(([g]) => BR_DEEZER.test(g));
        try { artists[id] = { ...artists[id], mb: await musicbrainzTags(name, brazilianHint) }; }
        catch { /* tenta de novo numa próxima vez */ }
        done++;
        progress(`Procurando no MusicBrainz os artistas que faltaram… ${fmt(done)} de ${fmt(needMb.length)}`, done, needMb.length, true);
        if (done % 10 === 0) save();
      });
    }
  } finally {
    save();
    progressDone();
  }
  if (cancelRequested) throw new Error('Busca de gêneros cancelada. O que já foi encontrado ficou salvo.');
  return { artists, tracks };
}

// Regras que agrupam gêneros (Spotify, Deezer e MusicBrainz, em inglês ou português) em
// categorias amplas. A ordem importa: a primeira que casar vence.
const MACRO_GENRES = [
  ['K-Pop', /\bk-?pop\b|korean|k-rap|k-indie/],
  ['J-Pop & Anime', /\bj-?pop\b|\bj-?rock\b|\banime\b|japanese|vocaloid|city pop/],
  ['Infantil', /infantil|children|\bkids\b/],
  ['Sertanejo', /sertanejo|agronejo|modão|moda de viola/],
  ['Funk BR', /funk (carioca|paulista|mtg|ostentacao|ostentação|consciente|melody|bh|mandelão|mandelao|150|brasileiro|de bh|pop)|brazilian funk|rave funk|\bfunk br\b|\bbaile funk\b|brega funk/],
  ['Pagode & Samba', /pagode|\bsamba\b|partido alto/],
  ['Forró & Piseiro', /forr[oó]|piseiro|arrocha|xote|bai[aã]o|\bbrega\b|tecnobrega|swingueira/],
  ['Axé', /\bax[eé]\b|pagod[aã]o|samba-reggae/],
  ['MPB & Bossa Nova', /\bmpb\b|bossa nova|tropic[aá]lia|brazilian (singer-songwriter|folk|jazz|music)|m[uú]sica brasileira|choro|velha guarda/],
  ['Gospel & Worship', /gospel|worship|christian|louvor|\bcrist[aã]o?\b|catholic|cat[oó]lic|religios/],
  ['Latino', /reggaeton|urbano latino|\blatin|trap latino|bachata|salsa|cumbia|dembow|corrido|mariachi|regional mexican|flamenco|tango|bolero/],
  ['Metal', /metal|djent|grindcore|deathcore|thrash/],
  ['Punk & Emo', /(?<!post-)punk|hardcore|\bemo\b|screamo/],
  ['Lo-fi & Chill', /lo-?fi|chillhop|\bchill\b|chillwave|study|sleep/],
  ['Hip Hop & Rap', /hip ?hop|\brap\b|\btrap\b|drill|grime|boom bap|phonk|\bplugg\b|\brage\b/],
  ['R&B & Soul', /r&b|\brnb\b|soul|motown|\bfunk\b|quiet storm|new jack swing/],
  ['Eletrônica', /house|techno|\bedm\b|electro|eletr[oô]nic|trance|dubstep|drum and bass|\bdnb\b|big room|hardstyle|garage(?! rock)|disco|synthwave|downtempo|ambient|\bidm\b|breakbeat|jungle|\bbass\b|dance(?! pop)/],
  ['Jazz', /jazz|swing|bebop|big band/],
  ['Blues', /blues/],
  ['Clássica', /classical|cl[aá]ssica\b|orchestra|orquestra|baroque|\bopera\b|choral|chamber|early music|minimalism|neoclassical/],
  ['Trilhas Sonoras', /soundtrack|\bscore\b|trilha|video game|\bvgm\b|\bmusical\b|broadway|show tunes|disney|filmes|films|games/],
  ['Reggae', /reggae|\bska\b|dancehall|\bdub\b/],
  ['Música do Mundo', /africa|indian music|m[uú]sica indiana|asi[aá]tica|asian music|world music/],
  ['Country & Folk', /country|folk|americana|bluegrass|singer-songwriter/],
  ['Indie & Alternativo', /indie|alternative|alternativo|shoegaze|dream pop|bedroom|post-rock|art rock|post-punk|new wave/],
  ['Rock', /rock|grunge|britpop/],
  ['Pop', /pop|boy band|girl group|idol|teen/],
];

const NO_GENRE = 'Sem gênero identificado';
const OTHER_GENRE = 'Outros gêneros';

function macroOf(genre) {
  const g = genre.toLowerCase();
  for (let i = 0; i < MACRO_GENRES.length; i++) if (MACRO_GENRES[i][1].test(g)) return i;
  return -1;
}

// Todas as pistas de gênero de uma faixa, com peso: [[gênero, peso], ...]
function genreVotes(t, G) {
  const e = G.artists[t.a[0]?.[0]] || {};
  const list = [];
  (e.s || []).forEach((g, i) => list.push([g, i === 0 ? 1.5 : 1]));
  for (const [g, w] of e.dz || []) list.push([g, isGenericPop(g) ? w * 0.6 : w]);
  for (const v of e.mb || []) list.push(v);
  const own = G.tracks[t.id]; // gênero do álbum desta música no Deezer
  if (own) list.push([own, isGenericPop(own) ? 1.2 : 2]);
  return list;
}

function macroGenreOf(votesList) {
  if (!votesList.length) return NO_GENRE;
  const votes = new Map();
  for (const [g, w] of votesList) {
    const m = macroOf(g);
    if (m !== -1) votes.set(m, (votes.get(m) || 0) + w);
  }
  let best = -1, bestScore = -1;
  for (const [m, score] of votes) {
    if (score > bestScore || (score === bestScore && m < best)) { best = m; bestScore = score; }
  }
  return best === -1 ? OTHER_GENRE : MACRO_GENRES[best][0];
}

function detailedGenreOf(t, G) {
  const e = G.artists[t.a[0]?.[0]] || {};
  if (e.s?.length) return e.s[0];
  const mb = (e.mb || []).find(([g]) => macroOf(g) !== -1);
  if (mb) return mb[0];
  return G.tracks[t.id] || e.dz?.[0]?.[0] || null;
}

/* ---------------- agrupamento ---------------- */

function yearOf(t) {
  const y = parseInt(t.rd.slice(0, 4), 10);
  return y > 1000 ? y : null;
}

function decadeLabel(y) {
  const d = Math.floor(y / 10) * 10;
  if (d < 2000) return `Anos ${String(d).slice(2)}`;
  return `Anos ${d}`;
}

// Retorna [rótulo, chaveDeOrdenação] para cada faixa, conforme o modo.
function keyFor(mode, t, G) {
  switch (mode) {
    case 'genre':
      return [macroGenreOf(genreVotes(t, G)), null];
    case 'genreDetail': {
      const g = detailedGenreOf(t, G);
      return [g ? titleCase(g) : NO_GENRE, null];
    }
    case 'artist':
      return [t.a[0]?.[1] || 'Artista desconhecido', null];
    case 'decade': {
      const y = yearOf(t);
      return y ? [decadeLabel(y), Math.floor(y / 10) * 10] : ['Data desconhecida', -1];
    }
    case 'year': {
      const y = yearOf(t);
      return y ? [String(y), y] : ['Data desconhecida', -1];
    }
    case 'added': {
      const y = t.ad ? new Date(t.ad).getFullYear() : null;
      return y ? [`Curtidas de ${y}`, y] : ['Data desconhecida', -1];
    }
  }
  return ['Outros', null];
}

const TAIL_LABELS = new Set(['Outros', NO_GENRE, OTHER_GENRE, 'Data desconhecida', 'Artista desconhecido']);

function buildGroups(mode, { min, others, prefix }, genres) {
  const map = new Map(); // label -> { ids, sort }
  for (const t of library.tracks) {
    const [label, sort] = keyFor(mode, t, genres);
    if (!map.has(label)) map.set(label, { ids: [], sort });
    map.get(label).ids.push(t.id);
  }

  let entries = [...map.entries()];
  const small = entries.filter(([, g]) => g.ids.length < min);
  entries = entries.filter(([, g]) => g.ids.length >= min);
  if (others && small.length) {
    const ids = small.flatMap(([, g]) => g.ids);
    const existing = entries.find(([label]) => label === 'Outros');
    if (existing) existing[1].ids.push(...ids);
    else entries.push(['Outros', { ids, sort: -2 }]);
  }

  const chronological = mode === 'decade' || mode === 'year' || mode === 'added';
  entries.sort(([la, a], [lb, b]) => {
    const ta = TAIL_LABELS.has(la), tb = TAIL_LABELS.has(lb);
    if (ta !== tb) return ta ? 1 : -1;
    if (chronological) return b.sort - a.sort;
    return b.ids.length - a.ids.length || la.localeCompare(lb, 'pt-BR');
  });

  let seq = 0;
  return entries.map(([label, g]) => ({
    id: `g${seq++}`,
    label,
    name: (prefix + label).slice(0, 100),
    ids: g.ids,
    include: label !== NO_GENRE && label !== 'Data desconhecida',
  }));
}

async function generate() {
  if (busy) return;
  if (!library?.tracks?.length) { toast('Nenhuma música curtida carregada.'); return; }
  const mode = document.querySelector('input[name=mode]:checked').value;
  const opts = readOptions();
  savePrefs();
  setBusy(true);
  $('#genreWarn').hidden = true;
  try {
    let genres = { artists: {}, tracks: {} };
    if (mode === 'genre' || mode === 'genreDetail') {
      genres = await ensureGenres();
      warnMissingGenres(genres);
    }
    currentMode = mode;
    groups = buildGroups(mode, opts, genres);
    $('#filter').value = '';
    $('#log').innerHTML = '';
    renderGroups();
    $('#review').hidden = false;
    $('#createCard').hidden = false;
    $('#review').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    handleError(e);
  } finally {
    setBusy(false);
    updateSummary();
  }
}

function warnMissingGenres(G) {
  const missing = library.tracks.filter((t) => !genreVotes(t, G).length).length;
  if (!missing) return;
  const el = $('#genreWarn');
  el.textContent = `Não achei o gênero de ${fmt(missing)} ${missing === 1 ? 'música' : 'músicas'} nem no Spotify, nem no Deezer, ` +
    `nem no MusicBrainz. Elas ficam em "${NO_GENRE}"; você pode juntá-las com outro grupo abaixo.`;
  el.hidden = false;
}

function readOptions() {
  return {
    min: Math.max(1, parseInt($('#optMin').value, 10) || 1),
    others: $('#optOthers').checked,
    prefix: $('#optPrefix').value,
    public: $('#optPublic').checked,
    reuse: $('#optReuse').checked,
  };
}

function savePrefs() {
  store.set(LS.prefs, { mode: document.querySelector('input[name=mode]:checked').value, ...readOptions() });
}

function loadPrefs() {
  const p = store.get(LS.prefs);
  if (!p) return;
  const radio = document.querySelector(`input[name=mode][value="${p.mode}"]`);
  if (radio) radio.checked = true;
  if (p.min) $('#optMin').value = p.min;
  $('#optPrefix').value = p.prefix || '';
  $('#optOthers').checked = p.others !== false;
  $('#optPublic').checked = !!p.public;
  $('#optReuse').checked = p.reuse !== false;
}

/* ---------------- revisão (render) ---------------- */

function coversHtml(ids) {
  const imgs = [];
  for (const id of ids) {
    const src = byId.get(id)?.img;
    if (src && !imgs.includes(src)) imgs.push(src);
    if (imgs.length === 4) break;
  }
  return imgs.map((src) => `<img src="${esc(src)}" alt="" loading="lazy">`).join('');
}

function renderGroups() {
  const list = $('#groups');
  if (!groups.length) {
    list.innerHTML = '<p class="sub">Nenhum grupo atingiu o mínimo de músicas. Diminua o mínimo ou ative "Outros".</p>';
    updateSummary();
    return;
  }
  list.innerHTML = groups.map((g) => `
    <div class="group${g.include ? '' : ' off'}" data-id="${g.id}">
      <div class="group-row">
        <input type="checkbox" class="inc" ${g.include ? 'checked' : ''} aria-label="Incluir ${esc(g.label)}">
        <div class="covers">${coversHtml(g.ids)}</div>
        <input type="text" class="gname" value="${esc(g.name)}" maxlength="100" aria-label="Nome da playlist">
        <span class="count">${fmt(g.ids.length)} ${g.ids.length === 1 ? 'música' : 'músicas'}</span>
        <select class="merge" aria-label="Juntar com outro grupo">
          <option value="">Juntar com…</option>
          ${groups.filter((o) => o.id !== g.id).map((o) => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}
        </select>
        <button class="btn ghost sm toggle">Ver músicas</button>
      </div>
      <div class="tracks" hidden></div>
    </div>`).join('');
  applyFilter();
  updateSummary();
}

function renderTracks(card, g) {
  const box = card.querySelector('.tracks');
  box.innerHTML = g.ids.map((id) => {
    const t = byId.get(id);
    if (!t) return '';
    return `<div class="track" data-track="${t.id}">
      <img src="${esc(t.img)}" alt="" loading="lazy">
      <div class="meta"><div>${esc(t.n)}</div><div class="artist">${esc(t.a.map((x) => x[1]).join(', '))}</div></div>
      <button class="rm" title="Tirar desta playlist" aria-label="Tirar desta playlist">×</button>
    </div>`;
  }).join('');
}

function updateSummary() {
  const sel = groups.filter((g) => g.include && g.ids.length);
  const uniq = new Set(sel.flatMap((g) => g.ids));
  $('#summary').textContent = `${sel.length} de ${groups.length} playlists · ${fmt(uniq.size)} músicas`;
  $('#createBtn').textContent = sel.length ? `Criar ${sel.length} ${sel.length === 1 ? 'playlist' : 'playlists'} no Spotify` : 'Criar playlists';
  $('#createBtn').disabled = busy || !sel.length;
}

function applyFilter() {
  const q = norm($('#filter').value);
  for (const card of document.querySelectorAll('.group')) {
    const g = groupById(card.dataset.id);
    card.hidden = !!q && !norm(g.name).includes(q) && !norm(g.label).includes(q);
  }
}

const groupById = (id) => groups.find((g) => g.id === id);

function onGroupsClick(e) {
  const card = e.target.closest('.group');
  if (!card) return;
  const g = groupById(card.dataset.id);

  if (e.target.closest('.toggle')) {
    const box = card.querySelector('.tracks');
    if (box.hidden) renderTracks(card, g);
    box.hidden = !box.hidden;
    e.target.textContent = box.hidden ? 'Ver músicas' : 'Esconder';
    return;
  }
  const rm = e.target.closest('.rm');
  if (rm) {
    const row = rm.closest('.track');
    g.ids = g.ids.filter((id) => id !== row.dataset.track);
    row.remove();
    card.querySelector('.count').textContent = `${fmt(g.ids.length)} ${g.ids.length === 1 ? 'música' : 'músicas'}`;
    updateSummary();
  }
}

function onGroupsChange(e) {
  const card = e.target.closest('.group');
  if (!card) return;
  const g = groupById(card.dataset.id);

  if (e.target.classList.contains('inc')) {
    g.include = e.target.checked;
    card.classList.toggle('off', !g.include);
    updateSummary();
  } else if (e.target.classList.contains('merge') && e.target.value) {
    const target = groupById(e.target.value);
    const seen = new Set(target.ids);
    for (const id of g.ids) if (!seen.has(id)) target.ids.push(id);
    // mantém a ordem original das curtidas (mais recentes primeiro)
    const order = new Map(library.tracks.map((t, i) => [t.id, i]));
    target.ids.sort((a, b) => order.get(a) - order.get(b));
    groups = groups.filter((x) => x.id !== g.id);
    renderGroups();
    toast(`"${g.name}" foi juntado com "${target.name}".`);
  }
}

function onGroupsInput(e) {
  if (!e.target.classList.contains('gname')) return;
  const g = groupById(e.target.closest('.group').dataset.id);
  g.name = e.target.value;
  for (const opt of document.querySelectorAll(`.merge option[value="${g.id}"]`)) opt.textContent = g.name;
}

/* ---------------- criar playlists ---------------- */

function logLine(name) {
  const li = document.createElement('li');
  li.innerHTML = `<span class="nm"></span><span class="st">Na fila…</span>`;
  li.querySelector('.nm').textContent = name;
  $('#log').appendChild(li);
  return {
    set(text, cls) {
      li.className = cls || '';
      li.querySelector('.st').innerHTML = text;
    },
  };
}

async function playlistUris(id) {
  const items = await getAll(`/playlists/${id}/items?limit=100`);
  return new Set(items.map((it) => (it.item || it.track)?.uri).filter(Boolean));
}

async function createPlaylists() {
  if (busy) return;
  const opts = readOptions();
  savePrefs();
  const sel = groups.filter((g) => g.include && g.ids.length);
  if (!sel.length) return;
  const total = sel.reduce((n, g) => n + g.ids.length, 0);
  if (!confirm(`Criar ${sel.length} playlists no seu Spotify (${fmt(total)} músicas no total)?`)) return;

  setBusy(true);
  $('#log').innerHTML = '';
  const lines = new Map(sel.map((g) => [g.id, logLine(g.name.trim() || g.label)]));
  let created = 0, updated = 0, failed = 0;

  try {
    const existing = new Map();
    if (opts.reuse) {
      progress('Verificando suas playlists atuais…', 0, 0);
      for (const p of await getAll('/me/playlists?limit=50')) {
        if (p?.owner?.id === me?.id && !existing.has(norm(p.name))) existing.set(norm(p.name), p);
      }
    }

    for (let i = 0; i < sel.length; i++) {
      const g = sel[i];
      const name = (g.name.trim() || g.label).slice(0, 100);
      const line = lines.get(g.id);
      progress(`Criando playlists… ${i + 1} de ${sel.length}`, i, sel.length);
      try {
        let uris = g.ids.map((id) => byId.get(id)?.uri).filter(Boolean);
        let pl = existing.get(norm(name));
        const isUpdate = !!pl;
        if (pl) {
          line.set('Comparando músicas…');
          const have = await playlistUris(pl.id);
          uris = uris.filter((u) => !have.has(u));
        } else {
          line.set('Criando…');
          pl = await api('/me/playlists', {
            method: 'POST',
            body: {
              name,
              public: opts.public,
              description: `Organizada automaticamente a partir das minhas músicas curtidas (${MODE_LABEL[currentMode]}).`,
            },
          });
          existing.set(norm(name), pl);
        }
        for (let j = 0; j < uris.length; j += 100) {
          line.set(`Adicionando músicas… ${fmt(Math.min(j + 100, uris.length))}/${fmt(uris.length)}`);
          await api(`/playlists/${pl.id}/items`, { method: 'POST', body: { uris: uris.slice(j, j + 100) } });
        }
        const link = pl.external_urls?.spotify
          ? ` · <a href="${esc(pl.external_urls.spotify)}" target="_blank" rel="noopener">abrir</a>` : '';
        if (isUpdate) {
          updated++;
          line.set(`${uris.length ? `+${fmt(uris.length)} músicas` : 'já estava completa'}${link}`, 'ok');
        } else {
          created++;
          line.set(`✓ ${fmt(uris.length)} músicas${link}`, 'ok');
        }
      } catch (e) {
        if (e instanceof AuthError) throw e;
        failed++;
        line.set(esc(e.message || 'Erro'), 'fail');
      }
    }
    const parts = [];
    if (created) parts.push(`${created} criadas`);
    if (updated) parts.push(`${updated} atualizadas`);
    if (failed) parts.push(`${failed} com erro`);
    toast(`Pronto! ${parts.join(', ')}.`, 6000);
  } catch (e) {
    handleError(e);
  } finally {
    progressDone();
    setBusy(false);
    updateSummary();
  }
}

/* ---------------- telas ---------------- */

function showSetupError(msg) {
  const el = $('#setupError');
  el.textContent = msg || '';
  el.hidden = !msg;
}

function showSetup(error) {
  $('#app').hidden = true;
  $('#user').hidden = true;
  $('#setup').hidden = false;
  $('#redirectUri').textContent = defaultRedirectUri();
  for (const el of document.querySelectorAll('.redirectUriText')) el.textContent = defaultRedirectUri();
  $('#redirectOverride').value = store.get(LS.redirect) || '';
  $('#clientId').value = clientId();
  if (!error && location.origin !== 'http://127.0.0.1:8888') {
    error = `Atenção: esta página está aberta em ${location.origin}, e não em http://127.0.0.1:8888. ` +
      'O endereço cadastrado no Spotify precisa ser o desta página; o mais fácil é abrir pelo "Abrir Organizador.bat".';
  }
  showSetupError(error);
}

async function startApp() {
  $('#setup').hidden = true;
  $('#app').hidden = false;
  loadPrefs();
  setBusy(true);
  try {
    me = await api('/me');
    $('#userName').textContent = me.display_name || me.id;
    $('#userImg').src = me.images?.[0]?.url || '';
    $('#user').hidden = false;
    indexLibrary();
    renderLibrary();
    if (!library?.tracks?.length || library.v !== LIBRARY_VERSION) await loadLibrary();
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) {
      logout('O Spotify bloqueou o acesso (403). Confira se sua conta está cadastrada em "User Management" no painel do app ' +
        'e se o dono do app tem Premium.');
      return;
    }
    handleError(e);
  } finally {
    setBusy(false);
    updateSummary();
  }
}

function bind() {
  $('#loginBtn').addEventListener('click', () => login().catch(handleError));
  $('#clientId').addEventListener('keydown', (e) => { if (e.key === 'Enter') login().catch(handleError); });
  $('#copyRedirect').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(defaultRedirectUri()); toast('Endereço copiado!'); }
    catch { toast('Não consegui copiar — selecione o texto e copie manualmente.'); }
  });
  $('#logoutBtn').addEventListener('click', () => logout());
  $('#reloadBtn').addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    try { await loadLibrary(); toast('Curtidas atualizadas.'); }
    catch (e) { handleError(e); }
    finally { progressDone(); setBusy(false); updateSummary(); }
  });
  $('#cancelBtn').addEventListener('click', () => { cancelRequested = true; });
  $('#generateBtn').addEventListener('click', generate);
  $('#createBtn').addEventListener('click', createPlaylists);
  $('#filter').addEventListener('input', applyFilter);
  $('#selAll').addEventListener('click', () => { groups.forEach((g) => { g.include = true; }); renderGroups(); });
  $('#selNone').addEventListener('click', () => { groups.forEach((g) => { g.include = false; }); renderGroups(); });
  const list = $('#groups');
  list.addEventListener('click', onGroupsClick);
  list.addEventListener('change', onGroupsChange);
  list.addEventListener('input', onGroupsInput);
}

async function init() {
  bind();
  if (location.hostname === 'localhost') {
    // O Spotify não aceita "localhost" como Redirect URI; use 127.0.0.1.
    location.replace(location.href.replace('//localhost', '//127.0.0.1'));
    return;
  }
  if (location.protocol === 'file:') {
    // Aberto com dois cliques no index.html: o Spotify não consegue voltar para um arquivo.
    showSetup('Você abriu o arquivo index.html direto, e assim o login não funciona. Dê dois cliques em ' +
      '"Abrir Organizador.bat" (ou, se ele já estiver aberto, acesse http://127.0.0.1:8888/).');
    $('#loginBtn').disabled = true;
    return;
  }
  const params = new URLSearchParams(location.search);
  if (params.has('code') || params.has('error')) {
    history.replaceState(null, '', defaultRedirectUri());
    try { await handleCallback(params); }
    catch (e) { showSetup(e.message); return; }
  }
  if (token) await startApp();
  else showSetup();
}

init();
