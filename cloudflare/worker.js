// worker.js  (archivo solo con caracteres ASCII: los acentos van como \u00e0 etc. para que no se estropeen al copiar)  Cloudflare Worker "tren-barbera"
// Hace estas cosas:
//   0) Pantalla de inicio con tres botones: Tren, Bus y Camaras        ( / )
//   1) Ensena la pagina con los proximos trenes de Rodalies              ( /tren )
//   2) Hace de intermediario con Renfe y con GitHub, porque el navegador
//      no puede pedirle los datos a Renfe directamente               ( /vivo, /avisos, /horario )
//   3) Pagina de camaras de trafico del Valles, las Rondas y Barcelona ciudad ( /camaras )
//      y el intermediario que trae cada imagen de la Generalitat      ( /cam?id=nc15 )
//   4) Pagina de bus: paradas de Moventis y TUS en Barbera, Badia y Sabadell ( /bus )
//      con su horario, que genera cada noche GitHub                   ( /bus/paradas, /bus/p?f=... )

const URL_HORARIO = 'https://raw.githubusercontent.com/tivoglio33-cloud/tren-barbera/main/data/estaciones.json';
const URL_VIVO = 'https://gtfsrt.renfe.com/trip_updates.json';
const URL_AVISOS = 'https://gtfsrt.renfe.com/alerts.json';
const URL_BUS = 'https://raw.githubusercontent.com/tivoglio33-cloud/tren-barbera/main/data/bus/';

// ------------------------------------------------------------------
// CAMARAS
// Cada linea es una camara:  id (nombre corto, sin espacios) / zona (en que apartado sale) / nombre / url (de donde sale la foto)
// Para anadir una: copia una linea parecida y cambia los 4 datos. Para quitar una: borra su linea entera.
// Fuentes: Servei Catala de Transit (mct.gencat.cat) y Ajuntament de Barcelona (bcn.cat)
// ------------------------------------------------------------------
const SCT = 'http://mct.gencat.cat/mct2bo/RenderService?sctidcam=';
const BCN = 'http://www.bcn.cat/transit/imatges/';

const ZONAS = [
  { id: 'barbera', titulo: 'Barber\u00e0' },
  { id: 'valles', titulo: 'Vall\u00e8s (C-58, AP-7, C-17)' },
  { id: 'rondas', titulo: 'Rondas (B-20 y B-10)' },
  { id: 'ciudad', titulo: 'Barcelona ciudad' },
];

const CAMARAS = [
  { id: 'nc15', zona: 'barbera', nombre: 'C-58 km 7 \u00b7 Barber\u00e0', url: SCT + 'nc15.gif' },
  { id: 'nc78', zona: 'barbera', nombre: 'AP-7 km 146,5 \u00b7 Barber\u00e0', url: SCT + 'nc78.gif' },

  { id: 'nc20', zona: 'valles', nombre: 'C-58 km 15 \u00b7 Sabadell', url: SCT + 'nc20.gif' },
  { id: 'nc28', zona: 'valles', nombre: 'C-58 km 18 \u00b7 Terrassa', url: SCT + 'nc28.gif' },
  { id: 'nc80', zona: 'valles', nombre: 'AP-7 km 154 \u00b7 Sant Cugat', url: SCT + 'nc80.gif' },
  { id: 'c1701', zona: 'valles', nombre: 'C-17 km 6 \u00b7 Montcada', url: SCT + 'c1701.gif' },

  // Rondas: primero la Ronda de Dalt (B-20) de oeste a este, luego la Ronda Litoral (B-10)
  { id: 'sc65', zona: 'rondas', nombre: 'B-20 km 0,8 \u00b7 Sant Boi', url: SCT + 'sc65.gif' },
  { id: 'sc64', zona: 'rondas', nombre: 'B-20 km 1,6 \u00b7 El Prat', url: SCT + 'sc64.gif' },
  { id: 'bEsplugues', zona: 'rondas', nombre: 'Ronda de Dalt \u00b7 Ctra. Esplugues', url: BCN + 'RondadeDaltCrtaEsplugues.gif' },
  { id: 'bSantGervasi', zona: 'rondas', nombre: 'Ronda de Dalt \u00b7 Sant Gervasi', url: BCN + 'RondadeDaltSantGervasi.gif' },
  { id: 'bVelodrom', zona: 'rondas', nombre: 'Ronda de Dalt \u00b7 Vel\u00f2drom', url: BCN + 'RondadeDaltVelodrom.gif' },
  { id: 'bMeridiana', zona: 'rondas', nombre: 'Ronda de Dalt \u00b7 Meridiana', url: BCN + 'RondadeDaltMeridiana.gif' },
  { id: 'c2001', zona: 'rondas', nombre: 'B-20 km 17 \u00b7 Santa Coloma', url: SCT + 'c2001.gif' },
  { id: 'nc81', zona: 'rondas', nombre: 'B-20 km 20 \u00b7 Badalona Montigal\u00e0', url: SCT + 'nc81.gif' },
  { id: 'nc64', zona: 'rondas', nombre: 'B-20 km 21 \u00b7 Badalona', url: SCT + 'nc64.gif' },
  { id: 'nc67', zona: 'rondas', nombre: 'B-20 km 24,6 \u00b7 Montgat', url: SCT + 'nc67.gif' },
  { id: 'bZonaFranca', zona: 'rondas', nombre: 'Ronda Litoral \u00b7 Zona Franca', url: BCN + 'RondaLitoralZonaFranca.gif' },
  { id: 'bMollFusta', zona: 'rondas', nombre: 'Ronda Litoral \u00b7 Moll de la Fusta', url: BCN + 'RondaLitoralMollFusta.gif' },
  { id: 'bBadajoz', zona: 'rondas', nombre: 'Ronda Litoral \u00b7 Badajoz', url: BCN + 'RondaLitoralBadajoz.gif' },

  // Barcelona ciudad: del centro hacia fuera
  { id: 'bPlCatalunya', zona: 'ciudad', nombre: 'Pl. Catalunya \u00b7 Pelai', url: BCN + 'PlCatalunya.gif' },
  { id: 'bUrquinaona', zona: 'ciudad', nombre: 'Pl. Urquinaona', url: BCN + 'PlUrquinaona.gif' },
  { id: 'bAntonioLopez', zona: 'ciudad', nombre: 'Pl. Antonio L\u00f3pez', url: BCN + 'PlAntonioLopez.gif' },
  { id: 'bPauVila', zona: 'ciudad', nombre: 'Pl. Pau Vila', url: BCN + 'PlPauVila.gif' },
  { id: 'bBalmesGranVia', zona: 'ciudad', nombre: 'Balmes \u00b7 Gran Via', url: BCN + 'BalmesGranVia.gif' },
  { id: 'bGranViaMarina', zona: 'ciudad', nombre: 'Gran Via \u00b7 Marina', url: BCN + 'GranViaMarina.gif' },
  { id: 'bMarinaPujades', zona: 'ciudad', nombre: 'Marina \u00b7 Pujades', url: BCN + 'MarinaPujades.gif' },
  { id: 'bDiagonalGranada', zona: 'ciudad', nombre: 'Diagonal \u00b7 Ciutat de Granada', url: BCN + 'DiagonalCiutatdeGranada.gif' },
  { id: 'bMeridianaFelipII', zona: 'ciudad', nombre: 'Meridiana \u00b7 Felip II', url: BCN + 'MeridianaFelipII.gif' },
  { id: 'bBalmesMitre', zona: 'ciudad', nombre: 'Balmes \u00b7 Mitre', url: BCN + 'BalmesMitre.gif' },
  { id: 'bPlMolina', zona: 'ciudad', nombre: 'Pl. Molina', url: BCN + 'PlMolina.gif' },
  { id: 'bDiagonalMCristina', zona: 'ciudad', nombre: 'Diagonal \u00b7 Maria Cristina', url: BCN + 'DiagonalMCristina.gif' },
  { id: 'bPlEspanya', zona: 'ciudad', nombre: 'Pl. Espanya \u00b7 Paral\u00b7lel', url: BCN + 'PlEspanya.gif' },
  { id: 'bPaisosCatalans', zona: 'ciudad', nombre: 'Pl. Pa\u00efsos Catalans \u00b7 Sants', url: BCN + 'PlPaissosCatalans.gif' },
];

function html(texto) {
  return new Response(texto, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/vivo') return await vivo();
      if (url.pathname === '/avisos') return await avisos();
      if (url.pathname === '/horario') return await pasar(URL_HORARIO, 600);
      if (url.pathname === '/cam') return await camara(url.searchParams.get('id'));
      if (url.pathname === '/bus/paradas') return await pasar(URL_BUS + 'paradas.json', 600);
      if (url.pathname === '/bus/p') {
        // Solo nombres de archivo normales: letras, numeros, _ y -
        const f = url.searchParams.get('f') || '';
        if (!/^[A-Za-z0-9_-]{1,80}$/.test(f)) return new Response('Parada desconocida', { status: 404 });
        return await pasar(URL_BUS + 'p/' + f + '.json', 600);
      }
      if (url.pathname === '/camaras') return html(paginaCamaras());
      if (url.pathname === '/tren') return html(PAGINA);
      if (url.pathname === '/bus') return html(PAGINA_BUS);
      if (url.pathname === '/manifest.json') return manifest();
      if (url.pathname === '/icono.svg') return icono();
      if (url.pathname === '/' || url.pathname === '/index.html') return html(PAGINA_INICIO);
      return new Response('No encontrado', { status: 404 });
    } catch (e) {
      return json({ error: String(e && e.message ? e.message : e) }, 502, 0);
    }
  },
};

function json(obj, status, segundos) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': segundos ? 'public, max-age=' + segundos : 'no-store',
    },
  });
}

async function bajar(url, segundos) {
  const r = await fetch(url, { cf: { cacheTtl: segundos, cacheEverything: true } });
  if (!r.ok) throw new Error('Origen respondi\u00f3 ' + r.status);
  return r;
}

async function pasar(url, segundos) {
  const r = await bajar(url, segundos);
  return new Response(r.body, {
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=' + segundos },
  });
}

// Solo se envian al movil los trenes de Rodalies de Barcelona (empiezan por "51"):
// el archivo de Renfe es de toda Espana y asi pesa mucho menos
async function vivo() {
  const datos = await (await bajar(URL_VIVO, 20)).json();
  const entity = (datos.entity || []).filter((e) => e.tripUpdate && e.tripUpdate.trip && String(e.tripUpdate.trip.tripId || '').startsWith('51'));
  return json({ header: datos.header, entity }, 200, 20);
}

async function avisos() {
  const datos = await (await bajar(URL_AVISOS, 60)).json();
  const entity = (datos.entity || []).filter((e) =>
    e.alert && (e.alert.informedEntity || []).some((ie) => String(ie.routeId || '').startsWith('51') || String(ie.stopId || '').startsWith('7'))
  );
  return json({ header: datos.header, entity }, 200, 60);
}

// Trae la foto de una camara. Solo deja pedir las camaras de la lista de arriba,
// para que nadie use tu Worker para descargar otras cosas.
// La Generalitat sirve las fotos sin candado (http) y una web con candado no puede ensenarlas directamente:
// por eso pasan por aqui.
async function camara(id) {
  const cam = CAMARAS.find((c) => c.id === id);
  if (!cam) return new Response('C\u00e1mara desconocida', { status: 404 });
  const r = await fetch(cam.url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
      accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
    },
    cf: { cacheTtl: 60, cacheEverything: true },
  });
  const tipo = r.headers.get('content-type') || '';
  if (!r.ok || tipo.indexOf('image') !== 0) return new Response('La c\u00e1mara no responde', { status: 502 });
  return new Response(r.body, {
    headers: { 'content-type': tipo, 'cache-control': 'public, max-age=60' },
  });
}

function manifest() {
  return json(
    {
      name: 'Tren y bus',
      short_name: 'Tren y bus',
      start_url: '/',
      display: 'standalone',
      background_color: '#0f141c',
      theme_color: '#161d28',
      icons: [{ src: '/icono.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
    },
    200,
    86400
  );
}

function icono() {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">' +
    '<rect width="512" height="512" rx="96" fill="#e2231a"/>' +
    '<rect x="136" y="96" width="240" height="250" rx="40" fill="#fff"/>' +
    '<rect x="166" y="130" width="180" height="90" rx="12" fill="#e2231a"/>' +
    '<circle cx="190" cy="285" r="22" fill="#e2231a"/><circle cx="322" cy="285" r="22" fill="#e2231a"/>' +
    '<path d="M186 346 L146 416 M326 346 L366 416" stroke="#fff" stroke-width="26" stroke-linecap="round"/>' +
    '</svg>';
  return new Response(svg, { headers: { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400' } });
}

// ------------------------------------------------------------------
// COSAS COMUNES A TODAS LAS PAGINAS
// ------------------------------------------------------------------
const CABEZA = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#161d28">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Tren y bus">
<link rel="manifest" href="/manifest.json">
<link rel="icon" href="/icono.svg">
<link rel="apple-touch-icon" href="/icono.svg">`;

// Boton "Inicio": si venimos de la pantalla de inicio, se hace como la flecha "atras"
// del movil, que ensena la pagina que ya estaba cargada (instantaneo). Si no, se carga de nuevo.
const VOLVER = `function volver() {
  try { window.stop(); } catch (e) {}
  var deAqui = document.referrer && document.referrer.indexOf(location.origin) === 0 && history.length > 1;
  if (deAqui) history.back(); else location.href = '/';
  return false;
}`;

const ESTILO_VOLVER = `.volver { display:inline-flex; align-items:center; gap:6px; min-height:40px; padding:0 16px; border:1.5px solid #2a3342; border-radius:999px;
    color:#fff; background:#222b3a; text-decoration:none; font-size:15px; font-weight:600; cursor:pointer; }`;

// Dibujos de los tres botones (lineas blancas, sin emojis)
const DIBUJO_TREN = '<svg viewBox="0 0 48 48" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="12" y="6" width="24" height="26" rx="5"/><path d="M12 19h24"/><circle cx="18" cy="26" r="1.5" fill="#fff"/><circle cx="30" cy="26" r="1.5" fill="#fff"/><path d="M17 32l-5 9M31 32l5 9M15 38h18"/></svg>';
const DIBUJO_BUS = '<svg viewBox="0 0 48 48" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="6" width="30" height="30" rx="5"/><path d="M9 22h30M9 14h30"/><circle cx="16" cy="29" r="1.5" fill="#fff"/><circle cx="32" cy="29" r="1.5" fill="#fff"/><path d="M14 36v5M34 36v5"/></svg>';
const DIBUJO_CAMARA = '<svg viewBox="0 0 48 48" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16h8l4-6h12l4 6h8v22H6z"/><circle cx="24" cy="26" r="7"/></svg>';

// ------------------------------------------------------------------
// PANTALLA DE INICIO  ( / )
// ------------------------------------------------------------------
const PAGINA_INICIO = `<!doctype html>
<html lang="es">
<head>
${CABEZA}
<title>Tren y bus</title>
<style>
  :root { --fondo:#0f141c; --caja:#161d28; --texto:#fff; --suave:#a8b3c4; }
  * { box-sizing: border-box; }
  html, body { margin:0; background:var(--fondo); color:var(--texto); min-height:100%;
    font-family: -apple-system, system-ui, Roboto, "Segoe UI", sans-serif; -webkit-tap-highlight-color: transparent; }
  main { padding: calc(env(safe-area-inset-top) + 28px) 16px 16px; max-width:520px; margin:0 auto; }
  h1 { margin:0 0 4px; font-size:26px; }
  .sub { color:var(--suave); font-size:15px; margin-bottom:22px; }
  .boton { display:flex; align-items:center; gap:18px; background:var(--caja); border-radius:18px; padding:18px;
    margin-bottom:14px; color:#fff; text-decoration:none; border:1.5px solid #222b3a; }
  .boton:active { transform:scale(.98); }
  .icono { width:72px; height:72px; border-radius:16px; display:flex; align-items:center; justify-content:center; flex:none; }
  .icono svg { width:44px; height:44px; }
  .nombre { font-size:22px; font-weight:700; }
  .que { color:var(--suave); font-size:14px; margin-top:3px; }
  footer { color:#5c6678; font-size:11px; text-align:center; padding: 8px 16px calc(env(safe-area-inset-bottom) + 20px); }
</style>
</head>
<body>
<main>
  <h1>Barber\u00e0 y alrededores</h1>
  <div class="sub">\u00bfQu\u00e9 quieres mirar?</div>
  <a class="boton" href="/tren">
    <div class="icono" style="background:#e2231a">${DIBUJO_TREN}</div>
    <div><div class="nombre">Tren</div><div class="que">Rodalies en directo, con retrasos</div></div>
  </a>
  <a class="boton" href="/bus">
    <div class="icono" style="background:#1f7a3f">${DIBUJO_BUS}</div>
    <div><div class="nombre">Bus</div><div class="que">Moventis y TUS \u00b7 Barber\u00e0, Badia y Sabadell</div></div>
  </a>
  <a class="boton" href="/camaras">
    <div class="icono" style="background:#3a4a63">${DIBUJO_CAMARA}</div>
    <div><div class="nombre">C\u00e1maras</div><div class="que">Tr\u00e1fico en autopistas y Rondas</div></div>
  </a>
</main>
<footer>Datos: Renfe, T-mobilitat (ATM), Servei Catal\u00e0 de Tr\u00e0nsit y Ajuntament de Barcelona</footer>
</body>
</html>`;

// ------------------------------------------------------------------
// LA PAGINA DE CAMARAS  ( /camaras )
// ------------------------------------------------------------------
function paginaCamaras() {
  function tarjetas(zona) {
    return CAMARAS.filter((c) => c.zona === zona)
      .map(
        (c) =>
          '<figure class="cam" data-id="' + c.id + '">' +
          '<img loading="lazy" alt="' + c.nombre + '" src="/cam?id=' + c.id + '">' +
          '<div class="sin">Sin imagen ahora mismo</div>' +
          '<figcaption>' + c.nombre + '</figcaption></figure>'
      )
      .join('');
  }
  return `<!doctype html>
<html lang="es">
<head>
${CABEZA}
<title>C\u00e1maras</title>
<style>
  :root { --fondo:#0f141c; --caja:#161d28; --texto:#fff; --suave:#a8b3c4; --gris:#8a94a6; }
  * { box-sizing: border-box; }
  html, body { margin:0; background:var(--fondo); color:var(--texto);
    font-family: -apple-system, system-ui, Roboto, "Segoe UI", sans-serif; -webkit-tap-highlight-color: transparent; }
  header { background:var(--caja); padding: calc(env(safe-area-inset-top) + 12px) 16px 12px; position:sticky; top:0; z-index:2; }
  ${ESTILO_VOLVER}
  h1 { margin:12px 0 0; font-size:24px; }
  .sub { color:var(--suave); font-size:14px; margin-top:2px; }
  main { padding:12px 12px 0; }
  h2 { font-size:16px; color:var(--suave); margin:14px 4px 8px; font-weight:600; }
  .rejilla { display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:10px; }
  .cam { margin:0; background:var(--caja); border-radius:12px; overflow:hidden; cursor:pointer; position:relative; }
  .cam img { display:block; width:100%; aspect-ratio:4/3; object-fit:cover; background:#0b0f15; }
  .cam .sin { display:none; aspect-ratio:4/3; align-items:center; justify-content:center; color:var(--gris); font-size:14px; }
  .cam.rota img { display:none; }
  .cam.rota .sin { display:flex; }
  .cam figcaption { padding:8px 10px; font-size:14px; font-weight:600; }
  .grande { display:none; position:fixed; inset:0; background:rgba(0,0,0,.92); z-index:10; align-items:center; justify-content:center; flex-direction:column; padding:16px; }
  .grande.abierta { display:flex; }
  .grande img { max-width:100%; max-height:80vh; border-radius:8px; }
  .grande div { margin-top:12px; font-size:15px; font-weight:600; }
  .grande small { color:var(--gris); margin-top:6px; }
  footer { color:#5c6678; font-size:11px; text-align:center; padding: 16px 16px calc(env(safe-area-inset-bottom) + 20px); }
</style>
</head>
<body>
<header>
  <a class="volver" href="/" onclick="return volver();">\u2190 Inicio</a>
  <h1>C\u00e1maras</h1>
  <div class="sub" id="sub">Tr\u00e1fico en directo \u00b7 se actualizan solas cada minuto</div>
</header>
<main>
${ZONAS.map((z) => '<h2>' + z.titulo + '</h2><div class="rejilla">' + tarjetas(z.id) + '</div>').join('')}
</main>
<div class="grande" id="grande"><img id="gImg" alt=""><div id="gTxt"></div><small>Toca para cerrar</small></div>
<footer>Im\u00e1genes: Servei Catal\u00e0 de Tr\u00e0nsit y Ajuntament de Barcelona \u00b7 la c\u00e1mara hace una foto cada pocos minutos</footer>
<script>
${VOLVER}
(function () {
  var cams = document.querySelectorAll('.cam');
  var grande = document.getElementById('grande'), gImg = document.getElementById('gImg'), gTxt = document.getElementById('gTxt');
  function dos(n) { return (n < 10 ? '0' : '') + n; }

  Array.prototype.forEach.call(cams, function (c) {
    var img = c.querySelector('img');
    img.onerror = function () { c.classList.add('rota'); };
    img.onload = function () { c.classList.remove('rota'); };
    c.onclick = function () {
      gImg.src = img.src;
      gTxt.textContent = c.querySelector('figcaption').textContent;
      grande.classList.add('abierta');
    };
  });
  grande.onclick = function () { grande.classList.remove('abierta'); };

  function refrescar() {
    if (document.hidden) return;
    var t = Date.now();
    Array.prototype.forEach.call(cams, function (c) {
      c.querySelector('img').src = '/cam?id=' + c.getAttribute('data-id') + '&t=' + t;
    });
    var d = new Date();
    document.getElementById('sub').textContent = 'Tr\u00e1fico en directo \u00b7 actualizado ' + dos(d.getHours()) + ':' + dos(d.getMinutes());
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refrescar(); });
  setInterval(refrescar, 60000);
})();
</script>
</body>
</html>`;
}

// ------------------------------------------------------------------
// LA PAGINA DE TRENES  ( /tren )
// ------------------------------------------------------------------
const PAGINA = `<!doctype html>
<html lang="es">
<head>
${CABEZA}
<title>Tren Rodalies</title>
<style>
  :root { --fondo:#0f141c; --caja:#161d28; --texto:#fff; --suave:#a8b3c4; --gris:#8a94a6;
          --verde:#3ddc84; --ambar:#ffb020; --rojo:#ff5a5a; --renfe:#e2231a; }
  * { box-sizing: border-box; }
  html, body { margin:0; background:var(--fondo); color:var(--texto);
    font-family: -apple-system, system-ui, Roboto, "Segoe UI", sans-serif; -webkit-tap-highlight-color: transparent; }
  header { background:var(--caja); padding: calc(env(safe-area-inset-top) + 12px) 16px 12px; position:sticky; top:0; z-index:2; }
  ${ESTILO_VOLVER}
  .estaciones { display:flex; gap:8px; overflow-x:auto; margin:10px 0; scrollbar-width:none; }
  .estaciones::-webkit-scrollbar { display:none; }
  .estaciones button { flex:none; border:1.5px solid #2a3342; background:none; color:var(--suave); font-size:14px; font-weight:600;
    padding:7px 14px; border-radius:999px; cursor:pointer; }
  .estaciones button.activo { border-color:#fff; color:#fff; background:#222b3a; }
  h1 { margin:0; font-size:24px; }
  .sub { color:var(--suave); font-size:14px; margin-top:2px; }
  .selector { display:flex; margin-top:12px; background:var(--fondo); border-radius:10px; padding:3px; }
  .selector button { flex:1; border:0; background:none; color:var(--suave); font-weight:600; font-size:14px;
    padding:10px 4px; border-radius:8px; cursor:pointer; }
  .selector button.activo { background:var(--renfe); color:#fff; }
  .error { background:var(--ambar); color:#1a1a1a; padding:10px 16px; font-size:14px; }
  .aviso { background:#3a2a10; margin:10px 12px 0; padding:12px; border-radius:10px; cursor:pointer; }
  .aviso b { color:var(--ambar); }
  .aviso p { color:#f0e2c8; font-size:14px; margin:8px 0 0; }
  main { padding:12px 12px 0; }
  .fila { display:flex; align-items:center; background:var(--caja); border-radius:12px; padding:14px; margin-bottom:10px; }
  .fila.anulado { opacity:.6; }
  .cuenta { width:70px; text-align:center; flex:none; }
  .num { font-size:30px; font-weight:800; line-height:1; }
  .num.hora { font-size:20px; }
  .min { color:var(--suave); font-size:12px; }
  .info { flex:1; min-width:0; }
  .destino { font-size:17px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .horas { color:#c9d2df; font-size:15px; margin-top:3px; }
  .horas s { color:var(--gris); }
  .linea { display:inline-block; font-size:12px; font-weight:800; padding:1px 6px; border-radius:5px; color:#fff; vertical-align:1px; }
  .ahora { color:var(--gris); font-size:13px; margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .badge { border:1.5px solid; border-radius:8px; padding:4px 8px; margin-left:8px; font-weight:700; font-size:13px; flex:none; }
  .vacio { color:var(--gris); text-align:center; margin-top:40px; }
  footer { color:#5c6678; font-size:11px; text-align:center; padding: 8px 16px calc(env(safe-area-inset-bottom) + 20px); }
  footer button { background:none; border:1px solid #2a3342; color:var(--suave); border-radius:8px; padding:8px 14px; margin-bottom:10px; font-size:14px; }
</style>
</head>
<body>
<header>
  <a class="volver" href="/" onclick="return volver();">\u2190 Inicio</a>
  <div class="estaciones" id="estaciones"></div>
  <h1 id="titulo">Rodalies</h1>
  <div class="sub" id="sub">cargando\u2026</div>
  <div class="selector">
    <button id="bS0" class="activo">\u2026</button>
    <button id="bS1">\u2026</button>
  </div>
</header>
<div id="error"></div>
<div id="avisos"></div>
<main id="lista"><div class="vacio">Cargando horario\u2026</div></main>
<footer><button id="bAct">\u21bb Actualizar</button><br>Datos: Renfe (CC BY 4.0) \u00b7 se actualiza solo cada 30 s</footer>

<script>
${VOLVER}
(function () {
  var CADA = 30;
  var datos = null, feedVivo = null, feedAvisos = null, verAvisos = false, actualizado = null, errorTxt = null;
  var estId = 'barbera', sentido = 0;
  try { estId = localStorage.getItem('estacion') || 'barbera'; var sv = localStorage.getItem('sentido_' + estId); sentido = sv === '1' ? 1 : 0; } catch (e) {}
  // El horario se guarda en el movil: asi al volver a la pagina se ve al momento, sin esperar a descargarlo otra vez
  try { var guardado = localStorage.getItem('horario'); if (guardado) datos = JSON.parse(guardado); } catch (e) { datos = null; }

  function dos(n) { return (n < 10 ? '0' : '') + n; }
  function hhmm(ms) { var d = new Date(ms); return dos(d.getHours()) + ':' + dos(d.getMinutes()); }
  function fechaLocal(d) { return d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate()); }
  function medianoche(f) { var p = f.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 0, 0, 0).getTime(); }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function corto(n) { return String(n).replace(/^Barcelona[ -]+/, '').replace(/ del Vall\u00e8s$/, ''); }

  function estacion() {
    if (!datos) return null;
    for (var i = 0; i < datos.estaciones.length; i++) if (datos.estaciones[i].id === estId) return datos.estaciones[i];
    return datos.estaciones[0];
  }

  // "5162L77412R4" -> "77412|R4": el trip_id cambia cada dia, esto sirve de respaldo
  function claveTren(id) { var m = /^\\d{4}[A-Z](\\d+)([A-Za-z][A-Za-z0-9]*)$/.exec(id); return m ? m[1] + '|' + m[2] : ''; }

  function leerVivo(feed, ids) {
    var porTrip = {}, porNumero = {};
    (feed.entity || []).forEach(function (e) {
      var tu = e.tripUpdate; if (!tu || !tu.trip || !tu.trip.tripId) return;
      var stus = tu.stopTimeUpdate || [];
      var conHora = null; for (var i = 0; i < stus.length; i++) if (stus[i].arrival) { conHora = stus[i]; break; }
      var retraso = tu.delay != null ? Number(tu.delay) : conHora ? Number(conHora.arrival.delay) : null;
      if (retraso != null && (isNaN(retraso) || Math.abs(retraso) > 4 * 3600)) retraso = null; // Renfe a veces manda -24 h
      var v = {
        retraso: retraso,
        cancelado: tu.trip.scheduleRelationship === 'CANCELED',
        noPara: stus.some(function (x) { return x.scheduleRelationship === 'SKIPPED' && ids.indexOf(x.stopId) >= 0; }),
        ahoraEn: conHora ? conHora.stopId : null,
        exacta: conHora && ids.indexOf(conHora.stopId) >= 0 && conHora.arrival.time ? Number(conHora.arrival.time) * 1000 : null
      };
      porTrip[tu.trip.tripId] = v;
      var k = claveTren(tu.trip.tripId); if (k) porNumero[k] = v;
    });
    return { porTrip: porTrip, porNumero: porNumero };
  }

  function leerAvisos(feed, est) {
    var out = [];
    ((feed && feed.entity) || []).forEach(function (e) {
      var a = e.alert; if (!a) return;
      var afecta = (a.informedEntity || []).some(function (ie) {
        var r = String(ie.routeId || '').trim();
        if (est.ids.indexOf(ie.stopId) >= 0) return true;
        if (r.indexOf('51') !== 0) return false;
        // routeId tipo "51T0010R4": termina en la linea y justo antes hay un numero
        return est.lineas.some(function (l) { return r.slice(-l.length) === l && /[0-9]/.test(r.charAt(r.length - l.length - 1)); });
      });
      if (!afecta) return;
      var tr = (a.descriptionText && a.descriptionText.translation) || (a.headerText && a.headerText.translation) || [];
      var t = null; for (var i = 0; i < tr.length; i++) if (tr[i].language === 'es') t = tr[i].text;
      if (!t && tr[0]) t = tr[0].text;
      if (t && out.indexOf(t.trim()) < 0) out.push(t.trim());
    });
    return out;
  }

  function proximos(est, vivo, ahora) {
    var lista = [];
    [ahora - 86400000, ahora, ahora + 86400000].forEach(function (t) {
      var f = fechaLocal(new Date(t)); var trenes = est.dias[f]; if (!trenes) return;
      var base = medianoche(f);
      trenes.forEach(function (tr) {
        if (tr.b !== sentido) return;
        var prog = base + tr.s * 1000;
        if (prog < ahora - 3 * 3600000 || prog > ahora + 6 * 3600000) return;
        var v = vivo ? (vivo.porTrip[tr.t] || vivo.porNumero[claveTren(tr.t)]) : null;
        var est2 = prog, estado = 'sinDatos', rmin = 0;
        if (v) {
          if (v.cancelado) estado = 'cancelado';
          else if (v.noPara) estado = 'noPara';
          else if (v.exacta != null) est2 = v.exacta;
          else if (v.retraso != null) est2 = prog + v.retraso * 1000;
          if (estado === 'sinDatos' && (v.exacta != null || v.retraso != null)) {
            rmin = Math.round((est2 - prog) / 60000);
            estado = rmin >= 2 ? 'retraso' : rmin <= -2 ? 'adelanto' : 'puntual';
          }
        }
        if (est2 < ahora - 60000) return; // ya ha pasado
        lista.push({ tr: tr, prog: prog, est: est2, estado: estado, rmin: rmin, ahoraEn: v ? v.ahoraEn : null });
      });
    });
    lista.sort(function (a, b) { return a.est - b.est; });
    return lista.slice(0, 12);
  }

  function pintar() {
    var ahora = Date.now();
    var est = estacion();

    // Botones de estacion
    var be = document.getElementById('estaciones');
    if (datos) {
      be.innerHTML = datos.estaciones.map(function (e) {
        return '<button data-id="' + esc(e.id) + '" class="' + (est && e.id === est.id ? 'activo' : '') + '">' + esc(corto(e.nombre)) + '</button>';
      }).join('');
      Array.prototype.forEach.call(be.querySelectorAll('button'), function (b) {
        b.onclick = function () { elegirEstacion(b.getAttribute('data-id')); };
      });
    }
    if (!est) return;

    document.getElementById('titulo').textContent = est.nombre;
    document.getElementById('sub').textContent = 'Rodalies ' + est.lineas.join(' \u00b7 ') + ' \u00b7 ' + (actualizado ? 'en directo ' + hhmm(actualizado) : 'cargando\u2026');
    var b0 = document.getElementById('bS0'), b1 = document.getElementById('bS1');
    b0.textContent = est.sentidos[0]; b1.textContent = est.sentidos[1];
    b0.className = sentido === 0 ? 'activo' : ''; b1.className = sentido === 1 ? 'activo' : '';

    var err = errorTxt;
    if (ahora - new Date(datos.generado).getTime() > 36 * 3600000) err = (err ? err + ' \u00b7 ' : '') + 'El horario es de hace m\u00e1s de un d\u00eda';
    document.getElementById('error').innerHTML = err ? '<div class="error">' + esc(err) + '</div>' : '';

    var avisos = leerAvisos(feedAvisos, est);
    var av = document.getElementById('avisos');
    if (avisos.length) {
      av.innerHTML = '<div class="aviso" id="cajaAviso"><b>\u26a0 ' + (avisos.length === 1 ? 'Aviso de Renfe' : avisos.length + ' avisos de Renfe') +
        ' ' + (verAvisos ? '\u25b2' : '\u25bc') + '</b>' + (verAvisos ? avisos.map(function (a) { return '<p>' + esc(a) + '</p>'; }).join('') : '') + '</div>';
      document.getElementById('cajaAviso').onclick = function () { verAvisos = !verAvisos; pintar(); };
    } else av.innerHTML = '';

    var cont = document.getElementById('lista');
    var vivo = feedVivo ? leerVivo(feedVivo, est.ids) : null;
    var trenes = proximos(est, vivo, ahora);
    if (!trenes.length) { cont.innerHTML = '<div class="vacio">No hay trenes en las pr\u00f3ximas horas</div>'; return; }
    var colores = { puntual: 'var(--verde)', adelanto: 'var(--verde)', retraso: 'var(--ambar)', cancelado: 'var(--rojo)', noPara: 'var(--rojo)', sinDatos: 'var(--gris)' };
    cont.innerHTML = trenes.map(function (x) {
      var anulado = x.estado === 'cancelado' || x.estado === 'noPara';
      var min = Math.round((x.est - ahora) / 60000);
      var cuenta = anulado ? '\u2014' : min <= 0 ? 'Ya' : min >= 60 ? hhmm(x.est) : String(min);
      var color = x.estado === 'retraso' && x.rmin >= 10 ? 'var(--rojo)' : colores[x.estado];
      var etiqueta = { puntual: 'Puntual', retraso: '+' + x.rmin + ' min', adelanto: x.rmin + ' min', cancelado: 'Cancelado', noPara: 'No para aqu\u00ed', sinDatos: 'Horario' }[x.estado];
      var horas = (hhmm(x.est) !== hhmm(x.prog) && !anulado) ? '<s>' + hhmm(x.prog) + '</s> ' + hhmm(x.est) : hhmm(x.prog);
      var cl = datos.colores && datos.colores[x.tr.l] ? '#' + datos.colores[x.tr.l] : '#556070';
      var sitio = x.ahoraEn && !anulado && datos.paradas[x.ahoraEn] ? '<div class="ahora">Pr\u00f3xima parada: ' + esc(datos.paradas[x.ahoraEn]) + '</div>' : '';
      return '<div class="fila' + (anulado ? ' anulado' : '') + '">' +
        '<div class="cuenta"><div class="num' + (cuenta.indexOf(':') >= 0 ? ' hora' : '') + '" style="color:' + color + '">' + cuenta + '</div>' +
        (!anulado && min > 0 && min < 60 ? '<div class="min">min</div>' : '') + '</div>' +
        '<div class="info"><div class="destino">' + esc(x.tr.d) + '</div>' +
        '<div class="horas">' + horas + ' \u00b7 <span class="linea" style="background:' + cl + '">' + esc(x.tr.l) + '</span> ' + esc(x.tr.n) + '</div>' + sitio + '</div>' +
        '<div class="badge" style="color:' + color + ';border-color:' + color + '">' + etiqueta + '</div></div>';
    }).join('');
  }

  function elegirEstacion(id) {
    estId = id;
    try { localStorage.setItem('estacion', id); sentido = localStorage.getItem('sentido_' + id) === '1' ? 1 : 0; } catch (e) { sentido = 0; }
    verAvisos = false;
    window.scrollTo(0, 0);
    pintar();
  }
  function elegirSentido(n) {
    sentido = n;
    try { localStorage.setItem('sentido_' + estId, String(n)); } catch (e) {}
    pintar();
  }

  function bajar(ruta) {
    return fetch(ruta + '?t=' + Date.now(), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status); return r.json();
    });
  }

  var cargando = false;
  // forzar = true cuando lo pide el boton "Actualizar": se baja el horario aunque el guardado sea reciente
  function refrescar(forzar) {
    if (cargando) return; cargando = true;
    var pideHorario = forzar === true || !datos || Date.now() - new Date(datos.generado).getTime() > 6 * 3600000;
    (pideHorario ? bajar('/horario').then(function (h) { datos = h; try { localStorage.setItem('horario', JSON.stringify(h)); } catch (e) {} }).catch(function () { if (!datos) throw new Error('No se pudo descargar el horario'); }) : Promise.resolve())
      .then(function () {
        return Promise.all([
          bajar('/vivo').then(function (f) { feedVivo = f; actualizado = Date.now(); errorTxt = null; })
            .catch(function () { errorTxt = 'Renfe no responde: se muestra el horario sin retrasos'; }),
          bajar('/avisos').then(function (f) { feedAvisos = f; }).catch(function () {})
        ]);
      })
      .catch(function (e) { errorTxt = e.message || 'Sin conexi\u00f3n'; })
      .then(function () { cargando = false; if (datos) pintar(); else document.getElementById('lista').innerHTML = '<div class="vacio">' + esc(errorTxt || 'Sin datos') + '</div>'; });
  }

  document.getElementById('bS0').onclick = function () { elegirSentido(0); };
  document.getElementById('bS1').onclick = function () { elegirSentido(1); };
  document.getElementById('bAct').onclick = function () { refrescar(true); };
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refrescar(); });
  // Al volver con "atras", la pagina sale al momento y se actualizan los datos
  window.addEventListener('pageshow', function (e) { if (e.persisted) { pintar(); refrescar(); } });

  if (datos) { try { pintar(); } catch (e) { datos = null; } }
  refrescar();
  setInterval(refrescar, CADA * 1000);
  setInterval(function () { if (datos) pintar(); }, 10000);
})();
</script>
</body>
</html>`;

// ------------------------------------------------------------------
// LA PAGINA DE BUS  ( /bus )
// Dos pantallas en la misma pagina:
//   - la lista de paradas (favoritas, por pueblo, buscador y "cerca de mi")
//   - una parada concreta, con los proximos buses (se abre con  /bus#p=CODIGO )
// Los horarios son los planificados de T-mobilitat: NO hay tiempo real.
// ------------------------------------------------------------------
const PAGINA_BUS = `<!doctype html>
<html lang="es">
<head>
${CABEZA}
<title>Bus</title>
<style>
  :root { --fondo:#0f141c; --caja:#161d28; --texto:#fff; --suave:#a8b3c4; --gris:#8a94a6;
          --verde:#3ddc84; --ambar:#ffb020; --bus:#1f7a3f; --estrella:#ffc83d; }
  * { box-sizing: border-box; }
  html, body { margin:0; background:var(--fondo); color:var(--texto);
    font-family: -apple-system, system-ui, Roboto, "Segoe UI", sans-serif; -webkit-tap-highlight-color: transparent; }
  header { background:var(--caja); padding: calc(env(safe-area-inset-top) + 12px) 16px 12px; position:sticky; top:0; z-index:2; }
  ${ESTILO_VOLVER}
  .arriba { display:flex; align-items:center; justify-content:space-between; gap:8px; }
  h1 { margin:12px 0 0; font-size:23px; line-height:1.2; }
  .sub { color:var(--suave); font-size:14px; margin-top:3px; }
  .chips { display:flex; gap:8px; overflow-x:auto; margin-top:12px; scrollbar-width:none; }
  .chips::-webkit-scrollbar { display:none; }
  .chips button { flex:none; border:1.5px solid #2a3342; background:none; color:var(--suave); font-size:14px; font-weight:600;
    padding:7px 14px; border-radius:999px; cursor:pointer; }
  .chips button.activo { border-color:#fff; color:#fff; background:#222b3a; }
  .busca { display:flex; gap:8px; margin-top:10px; }
  .busca input { flex:1; min-width:0; background:var(--fondo); border:1.5px solid #2a3342; color:#fff; border-radius:10px;
    padding:11px 12px; font-size:16px; }
  .busca button { flex:none; background:var(--bus); color:#fff; border:0; border-radius:10px; padding:0 14px; font-size:15px; font-weight:600; cursor:pointer; }
  .busca button.activo { background:#fff; color:#0f141c; }
  .estrella { background:none; border:1.5px solid #2a3342; border-radius:999px; min-height:40px; padding:0 14px; color:var(--suave);
    font-size:15px; font-weight:600; cursor:pointer; }
  .estrella.si { color:var(--estrella); border-color:var(--estrella); }
  .nota { background:#1d2a20; color:#cfe8d5; margin:10px 12px 0; padding:10px 12px; border-radius:10px; font-size:13px; }
  .error { background:var(--ambar); color:#1a1a1a; padding:10px 16px; font-size:14px; }
  main { padding:12px 12px 0; }
  .parada { display:flex; align-items:center; gap:12px; background:var(--caja); border-radius:12px; padding:12px 14px; margin-bottom:8px; cursor:pointer; }
  .parada .info { flex:1; min-width:0; }
  .parada .nom { font-size:16px; font-weight:600; }
  .parada .det { color:var(--gris); font-size:13px; margin-top:4px; }
  .parada .fav { color:var(--estrella); font-size:18px; flex:none; }
  .linea { display:inline-block; font-size:12px; font-weight:800; padding:1px 6px; border-radius:5px; color:#fff; margin:2px 3px 0 0; }
  .fila { display:flex; align-items:center; background:var(--caja); border-radius:12px; padding:14px; margin-bottom:10px; }
  .cuenta { width:70px; text-align:center; flex:none; }
  .num { font-size:30px; font-weight:800; line-height:1; color:var(--verde); }
  .num.hora { font-size:20px; color:#fff; }
  .min { color:var(--suave); font-size:12px; }
  .destino { font-size:16px; font-weight:600; line-height:1.25; }
  .horas { color:#c9d2df; font-size:15px; margin-top:4px; }
  .vacio { color:var(--gris); text-align:center; margin-top:40px; padding:0 20px; }
  footer { color:#5c6678; font-size:11px; text-align:center; padding: 12px 16px calc(env(safe-area-inset-bottom) + 20px); }
</style>
</head>
<body>
<header id="cab"></header>
<div id="error"></div>
<div id="nota"></div>
<main id="lista"><div class="vacio">Cargando paradas\u2026</div></main>
<footer id="pie">Horarios: T-mobilitat (ATM) \u00b7 Moventis y TUS</footer>

<script>
${VOLVER}
(function () {
  var indice = null, errorTxt = null;
  var zona = 'fav', texto = '', aqui = null, buscandoAqui = false;
  var datosParada = {}; // f -> { bajado: ms, d: {...} }
  var filtroLinea = '', vinoDeLista = false;
  try { var zg = localStorage.getItem('bus_zona'); if (zg !== null) zona = zg === 'fav' ? 'fav' : Number(zg); } catch (e) {}
  try { var ig = localStorage.getItem('bus_indice'); if (ig) indice = JSON.parse(ig); } catch (e) { indice = null; }

  function favoritas() { try { return JSON.parse(localStorage.getItem('bus_favoritas') || '[]'); } catch (e) { return []; } }
  function guardarFavoritas(l) { try { localStorage.setItem('bus_favoritas', JSON.stringify(l)); } catch (e) {} }
  function esFavorita(f) { return favoritas().indexOf(f) >= 0; }

  function dos(n) { return (n < 10 ? '0' : '') + n; }
  function hhmm(ms) { var d = new Date(ms); return dos(d.getHours()) + ':' + dos(d.getMinutes()); }
  function fechaLocal(d) { return d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate()); }
  function medianoche(f) { var p = f.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 0, 0, 0).getTime(); }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function norm(t) { return String(t || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase(); }
  function km(a, b, c, d) {
    var r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r;
    return Math.sqrt(x * x + y * y) * 6371;
  }
  function distancia(k) { return k < 1 ? Math.round(k * 1000 / 10) * 10 + ' m' : k.toFixed(1).replace('.', ',') + ' km'; }

  // Las lineas van por "clave" (casi siempre su nombre; "M-L1" si Moventis y TUS tienen las dos una L1)
  function nombreLinea(clave) { var l = indice && indice.lineas[clave]; return l && l.n ? l.n : String(clave).replace(/^M-/, ''); }
  function etiquetaLinea(nombre) {
    var l = indice && indice.lineas[nombre];
    var fondo = l && l.c ? '#' + l.c : (l && l.op === 'TUS' ? '#2e7d32' : '#0b5aa6');
    var letra = l && l.t ? '#' + l.t : '#fff';
    return '<span class="linea" style="background:' + fondo + ';color:' + letra + '">' + esc(nombreLinea(nombre)) + '</span>';
  }
  function zonaNombre(z) { return indice && indice.zonas[z] ? indice.zonas[z] : ''; }
  function paradaPorF(f) {
    if (!indice) return null;
    for (var i = 0; i < indice.paradas.length; i++) if (indice.paradas[i].f === f) return indice.paradas[i];
    return null;
  }
  function paradaActual() { var m = /p=([A-Za-z0-9_-]+)/.exec(location.hash); return m ? m[1] : null; }

  // ---------------- lista de paradas ----------------
  function pintarLista() {
    var cab = document.getElementById('cab');
    var zonas = indice ? indice.zonas : [];
    cab.innerHTML =
      '<div class="arriba"><a class="volver" href="/" onclick="return volver();">\u2190 Inicio</a></div>' +
      '<h1>Bus</h1><div class="sub">Moventis y TUS \u00b7 toca una parada para ver sus buses</div>' +
      '<div class="chips" id="chips">' +
        '<button data-z="fav" class="' + (zona === 'fav' && !aqui ? 'activo' : '') + '">\u2605 Favoritas</button>' +
        zonas.map(function (n, i) { return '<button data-z="' + i + '" class="' + (zona === i && !aqui ? 'activo' : '') + '">' + esc(n) + '</button>'; }).join('') +
      '</div>' +
      '<div class="busca"><input id="texto" type="search" placeholder="Calle o n\u00ba del cartel" value="' + esc(texto) + '">' +
      '<button id="bAqui" class="' + (aqui ? 'activo' : '') + '">' + (buscandoAqui ? 'Buscando\u2026' : 'Cerca de m\u00ed') + '</button></div>';
    Array.prototype.forEach.call(cab.querySelectorAll('#chips button'), function (b) {
      b.onclick = function () {
        var z = b.getAttribute('data-z'); zona = z === 'fav' ? 'fav' : Number(z); aqui = null;
        try { localStorage.setItem('bus_zona', String(zona)); } catch (e) {}
        pintarLista(); window.scrollTo(0, 0);
      };
    });
    var inp = document.getElementById('texto');
    inp.oninput = function () { texto = inp.value; pintarFilas(); };
    document.getElementById('bAqui').onclick = cercaDeMi;
    document.getElementById('nota').innerHTML = '';
    pintarFilas();
  }

  function pintarFilas() {
    var cont = document.getElementById('lista');
    document.getElementById('error').innerHTML = errorTxt ? '<div class="error">' + esc(errorTxt) + '</div>' : '';
    if (!indice) { cont.innerHTML = '<div class="vacio">' + esc(errorTxt || 'Cargando paradas\u2026') + '</div>'; return; }
    var t = norm(texto).trim();
    var favs = favoritas();
    var lista = indice.paradas.filter(function (p) {
      if (t) return norm(p.n).indexOf(t) >= 0 || String(p.c).indexOf(t) === 0 || String(p.c2 || '').indexOf(t) === 0 ||
        p.l.some(function (l) { return norm(nombreLinea(l)) === t; });
      if (aqui) return true;
      if (zona === 'fav') return favs.indexOf(p.f) >= 0;
      return p.z === zona;
    });
    if (aqui) {
      lista.forEach(function (p) { p._km = km(aqui.lat, aqui.lon, p.la, p.lo); });
      lista.sort(function (a, b) { return a._km - b._km; });
      lista = lista.slice(0, 25);
    }
    if (!lista.length) {
      cont.innerHTML = '<div class="vacio">' + (t ? 'Ninguna parada con ese nombre o n\u00famero'
        : zona === 'fav' ? 'A\u00fan no tienes paradas favoritas.<br><br>Busca una por el nombre de la calle o el n\u00famero del cartel, o toca un pueblo arriba. Dentro de la parada, toca \u2606 para guardarla aqu\u00ed.'
        : 'No hay paradas') + '</div>';
      return;
    }
    cont.innerHTML = lista.slice(0, 200).map(function (p) {
      var det = [];
      if (p.c) det.push('n\u00ba ' + esc(p.c));
      if (aqui) det.push(distancia(p._km));
      else if (t || zona === 'fav') det.push(esc(zonaNombre(p.z)));
      var hacia = p.h && p.h.length ? '<div class="det">\u2192 ' + p.h.map(esc).join(' \u00b7 ') + '</div>' : '';
      return '<div class="parada" data-f="' + esc(p.f) + '"><div class="info"><div class="nom">' + esc(p.n) + '</div>' +
        '<div class="det">' + det.join(' \u00b7 ') + '</div>' + hacia + '<div>' + p.l.map(etiquetaLinea).join('') + '</div></div>' +
        (favs.indexOf(p.f) >= 0 ? '<div class="fav">\u2605</div>' : '') + '</div>';
    }).join('') + (lista.length > 200 ? '<div class="vacio">Hay m\u00e1s: escribe arriba para buscar</div>' : '');
    Array.prototype.forEach.call(cont.querySelectorAll('.parada'), function (d) {
      d.onclick = function () { vinoDeLista = true; location.hash = 'p=' + d.getAttribute('data-f'); };
    });
  }

  function cercaDeMi() {
    if (aqui) { aqui = null; pintarLista(); return; }
    if (!navigator.geolocation) { errorTxt = 'Este m\u00f3vil no deja saber la ubicaci\u00f3n'; pintarFilas(); return; }
    buscandoAqui = true; pintarLista();
    navigator.geolocation.getCurrentPosition(function (pos) {
      buscandoAqui = false; errorTxt = null;
      aqui = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      texto = ''; pintarLista(); window.scrollTo(0, 0);
    }, function () {
      buscandoAqui = false;
      errorTxt = 'No se pudo saber d\u00f3nde est\u00e1s (\u00bfhas dado permiso de ubicaci\u00f3n?)';
      pintarLista();
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  }

  // ---------------- una parada ----------------
  function pintarParada(f) {
    var p = paradaPorF(f);
    var cab = document.getElementById('cab');
    var fav = esFavorita(f);
    cab.innerHTML =
      '<div class="arriba"><a class="volver" href="/bus" id="bAtras">\u2190 Paradas</a>' +
      '<button class="estrella' + (fav ? ' si' : '') + '" id="bFav">' + (fav ? '\u2605 Favorita' : '\u2606 Guardar') + '</button></div>' +
      '<h1>' + esc(p ? p.n : 'Parada') + '</h1>' +
      '<div class="sub">' + (p ? (p.c ? 'n\u00ba ' + esc(p.c) + ' \u00b7 ' : '') + esc(zonaNombre(p.z)) : '') + '</div>' +
      (p && p.l.length > 1 ? '<div class="chips" id="chipsL"><button data-l="" class="' + (!filtroLinea ? 'activo' : '') + '">Todas</button>' +
        p.l.map(function (l) { return '<button data-l="' + esc(l) + '" class="' + (filtroLinea === l ? 'activo' : '') + '">' + esc(nombreLinea(l)) + '</button>'; }).join('') + '</div>' : '');
    document.getElementById('bAtras').onclick = function () {
      // Si se entro tocando la lista, se hace como la flecha "atras" del movil; si no, se va a la lista
      if (vinoDeLista) { vinoDeLista = false; history.back(); } else location.hash = '';
      return false;
    };
    document.getElementById('bFav').onclick = function () {
      var l = favoritas(), i = l.indexOf(f);
      if (i >= 0) l.splice(i, 1); else l.push(f);
      guardarFavoritas(l); pintarParada(f);
    };
    Array.prototype.forEach.call(cab.querySelectorAll('#chipsL button'), function (b) {
      b.onclick = function () { filtroLinea = b.getAttribute('data-l'); pintarParada(f); };
    });
    document.getElementById('nota').innerHTML = '<div class="nota">Horas seg\u00fan el horario oficial: Moventis y TUS no publican el tiempo real, as\u00ed que un bus puede llegar algo antes o despu\u00e9s.</div>';
    pintarSalidas(f);
    var guardada = datosParada[f];
    if (!guardada || Date.now() - guardada.bajado > 3 * 3600000) bajarParada(f);
  }

  function pintarSalidas(f) {
    var cont = document.getElementById('lista');
    var g = datosParada[f];
    document.getElementById('error').innerHTML = errorTxt ? '<div class="error">' + esc(errorTxt) + '</div>' : '';
    if (!g) { cont.innerHTML = '<div class="vacio">' + esc(errorTxt || 'Cargando horario\u2026') + '</div>'; return; }
    var d = g.d, ahora = Date.now(), lista = [];
    [ahora - 86400000, ahora, ahora + 86400000].forEach(function (t) {
      var fecha = fechaLocal(new Date(t)); var salidas = d.dias[fecha]; if (!salidas) return;
      var base = medianoche(fecha);
      salidas.forEach(function (x) {
        var cuando = base + x[0] * 1000;
        if (cuando < ahora - 60000 || cuando > ahora + 16 * 3600000) return;
        var linea = d.L[x[1]];
        if (filtroLinea && linea !== filtroLinea) return;
        lista.push({ t: cuando, l: linea, d: d.D[x[2]] });
      });
    });
    lista.sort(function (a, b) { return a.t - b.t; });
    lista = lista.slice(0, 20);
    if (!lista.length) { cont.innerHTML = '<div class="vacio">No hay buses en las pr\u00f3ximas horas</div>'; return; }
    cont.innerHTML = lista.map(function (x) {
      var min = Math.round((x.t - ahora) / 60000);
      var cuenta = min <= 0 ? 'Ya' : min >= 60 ? hhmm(x.t) : String(min);
      return '<div class="fila"><div class="cuenta"><div class="num' + (cuenta.indexOf(':') >= 0 ? ' hora' : '') + '">' + cuenta + '</div>' +
        (min > 0 && min < 60 ? '<div class="min">min</div>' : '') + '</div>' +
        '<div class="info" style="flex:1;min-width:0"><div class="destino">' + esc(x.d) + '</div>' +
        '<div class="horas">' + hhmm(x.t) + ' \u00b7 ' + etiquetaLinea(x.l) + '</div></div></div>';
    }).join('');
  }

  function bajar(ruta) {
    return fetch(ruta, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status); return r.json();
    });
  }

  function bajarParada(f) {
    bajar('/bus/p?f=' + encodeURIComponent(f) + '&t=' + Date.now()).then(function (d) {
      datosParada[f] = { bajado: Date.now(), d: d }; errorTxt = null;
      try { localStorage.setItem('bus_p_' + f, JSON.stringify(datosParada[f])); } catch (e) {}
    }).catch(function () {
      if (!datosParada[f]) errorTxt = 'No se pudo descargar el horario de esta parada';
    }).then(function () { if (paradaActual() === f) pintarSalidas(f); });
  }

  function bajarIndice() {
    bajar('/bus/paradas?t=' + Date.now()).then(function (d) {
      indice = d; errorTxt = null;
      try { localStorage.setItem('bus_indice', JSON.stringify(d)); } catch (e) {}
    }).catch(function () {
      if (!indice) errorTxt = 'No se pudo descargar la lista de paradas';
    }).then(pintar);
  }

  // ---------------- que pantalla toca ----------------
  function pintar() {
    var f = paradaActual();
    if (f) {
      if (!datosParada[f]) { try { var g = localStorage.getItem('bus_p_' + f); if (g) datosParada[f] = JSON.parse(g); } catch (e) {} }
      pintarParada(f);
    } else {
      filtroLinea = '';
      pintarLista();
    }
  }

  window.addEventListener('hashchange', function () { window.scrollTo(0, 0); pintar(); });
  window.addEventListener('pageshow', function (e) { if (e.persisted) pintar(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && paradaActual()) pintarSalidas(paradaActual()); });
  // La cuenta atras de los minutos se recalcula sola
  setInterval(function () { var f = paradaActual(); if (f && !document.hidden) pintarSalidas(f); }, 20000);

  pintar();
  if (!indice || Date.now() - new Date(indice.generado).getTime() > 6 * 3600000) bajarIndice();
  else setTimeout(bajarIndice, 2000); // por si ha cambiado algo, sin hacer esperar
})();
</script>
</body>
</html>`;
