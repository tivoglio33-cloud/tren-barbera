// worker.js — Cloudflare Worker "tren-barbera"
// Hace dos cosas:
//   1) Enseña la página web con los próximos trenes de Rodalies en varias estaciones  ( / )
//   2) Hace de intermediario con Renfe y con GitHub, porque el navegador
//      no puede pedirle los datos a Renfe directamente               ( /vivo, /avisos, /horario )

const URL_HORARIO = 'https://raw.githubusercontent.com/tivoglio33-cloud/tren-barbera/main/data/estaciones.json';
const URL_VIVO = 'https://gtfsrt.renfe.com/trip_updates.json';
const URL_AVISOS = 'https://gtfsrt.renfe.com/alerts.json';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/vivo') return await vivo();
      if (url.pathname === '/avisos') return await avisos();
      if (url.pathname === '/horario') return await pasar(URL_HORARIO, 600);
      if (url.pathname === '/manifest.json') return manifest();
      if (url.pathname === '/icono.svg') return icono();
      if (url.pathname === '/' || url.pathname === '/index.html') {
        return new Response(PAGINA, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } });
      }
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
  if (!r.ok) throw new Error('Origen respondió ' + r.status);
  return r;
}

async function pasar(url, segundos) {
  const r = await bajar(url, segundos);
  return new Response(r.body, {
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=' + segundos },
  });
}

// Solo se envían al móvil los trenes de Rodalies de Barcelona (empiezan por "51"):
// el archivo de Renfe es de toda España y así pesa mucho menos
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

function manifest() {
  return json(
    {
      name: 'Tren Rodalies',
      short_name: 'Tren',
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
// LA PÁGINA
// ------------------------------------------------------------------
const PAGINA = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#161d28">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Tren">
<link rel="manifest" href="/manifest.json">
<link rel="icon" href="/icono.svg">
<link rel="apple-touch-icon" href="/icono.svg">
<title>Tren Rodalies</title>
<style>
  :root { --fondo:#0f141c; --caja:#161d28; --texto:#fff; --suave:#a8b3c4; --gris:#8a94a6;
          --verde:#3ddc84; --ambar:#ffb020; --rojo:#ff5a5a; --renfe:#e2231a; }
  * { box-sizing: border-box; }
  html, body { margin:0; background:var(--fondo); color:var(--texto);
    font-family: -apple-system, system-ui, Roboto, "Segoe UI", sans-serif; -webkit-tap-highlight-color: transparent; }
  header { background:var(--caja); padding: calc(env(safe-area-inset-top) + 12px) 16px 12px; position:sticky; top:0; z-index:2; }
  .estaciones { display:flex; gap:8px; overflow-x:auto; margin-bottom:10px; scrollbar-width:none; }
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
  <div class="estaciones" id="estaciones"></div>
  <h1 id="titulo">Rodalies</h1>
  <div class="sub" id="sub">cargando…</div>
  <div class="selector">
    <button id="bS0" class="activo">…</button>
    <button id="bS1">…</button>
  </div>
</header>
<div id="error"></div>
<div id="avisos"></div>
<main id="lista"><div class="vacio">Cargando horario…</div></main>
<footer><button id="bAct">↻ Actualizar</button><br>Datos: Renfe (CC BY 4.0) · se actualiza solo cada 30 s</footer>

<script>
(function () {
  var CADA = 30;
  var datos = null, feedVivo = null, feedAvisos = null, verAvisos = false, actualizado = null, errorTxt = null;
  var estId = 'barbera', sentido = 0;
  try { estId = localStorage.getItem('estacion') || 'barbera'; var sv = localStorage.getItem('sentido_' + estId); sentido = sv === '1' ? 1 : 0; } catch (e) {}

  function dos(n) { return (n < 10 ? '0' : '') + n; }
  function hhmm(ms) { var d = new Date(ms); return dos(d.getHours()) + ':' + dos(d.getMinutes()); }
  function fechaLocal(d) { return d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate()); }
  function medianoche(f) { var p = f.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 0, 0, 0).getTime(); }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function corto(n) { return String(n).replace(/^Barcelona[ -]+/, '').replace(/ del Vallès$/, ''); }

  function estacion() {
    if (!datos) return null;
    for (var i = 0; i < datos.estaciones.length; i++) if (datos.estaciones[i].id === estId) return datos.estaciones[i];
    return datos.estaciones[0];
  }

  // "5162L77412R4" -> "77412|R4": el trip_id cambia cada día, esto sirve de respaldo
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
        // routeId tipo "51T0010R4": termina en la línea y justo antes hay un número
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

    // Botones de estación
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
    document.getElementById('sub').textContent = 'Rodalies ' + est.lineas.join(' · ') + ' · ' + (actualizado ? 'en directo ' + hhmm(actualizado) : 'cargando…');
    var b0 = document.getElementById('bS0'), b1 = document.getElementById('bS1');
    b0.textContent = est.sentidos[0]; b1.textContent = est.sentidos[1];
    b0.className = sentido === 0 ? 'activo' : ''; b1.className = sentido === 1 ? 'activo' : '';

    var err = errorTxt;
    if (ahora - new Date(datos.generado).getTime() > 36 * 3600000) err = (err ? err + ' · ' : '') + 'El horario es de hace más de un día';
    document.getElementById('error').innerHTML = err ? '<div class="error">' + esc(err) + '</div>' : '';

    var avisos = leerAvisos(feedAvisos, est);
    var av = document.getElementById('avisos');
    if (avisos.length) {
      av.innerHTML = '<div class="aviso" id="cajaAviso"><b>⚠ ' + (avisos.length === 1 ? 'Aviso de Renfe' : avisos.length + ' avisos de Renfe') +
        ' ' + (verAvisos ? '▲' : '▼') + '</b>' + (verAvisos ? avisos.map(function (a) { return '<p>' + esc(a) + '</p>'; }).join('') : '') + '</div>';
      document.getElementById('cajaAviso').onclick = function () { verAvisos = !verAvisos; pintar(); };
    } else av.innerHTML = '';

    var cont = document.getElementById('lista');
    var vivo = feedVivo ? leerVivo(feedVivo, est.ids) : null;
    var trenes = proximos(est, vivo, ahora);
    if (!trenes.length) { cont.innerHTML = '<div class="vacio">No hay trenes en las próximas horas</div>'; return; }
    var colores = { puntual: 'var(--verde)', adelanto: 'var(--verde)', retraso: 'var(--ambar)', cancelado: 'var(--rojo)', noPara: 'var(--rojo)', sinDatos: 'var(--gris)' };
    cont.innerHTML = trenes.map(function (x) {
      var anulado = x.estado === 'cancelado' || x.estado === 'noPara';
      var min = Math.round((x.est - ahora) / 60000);
      var cuenta = anulado ? '—' : min <= 0 ? 'Ya' : min >= 60 ? hhmm(x.est) : String(min);
      var color = x.estado === 'retraso' && x.rmin >= 10 ? 'var(--rojo)' : colores[x.estado];
      var etiqueta = { puntual: 'Puntual', retraso: '+' + x.rmin + ' min', adelanto: x.rmin + ' min', cancelado: 'Cancelado', noPara: 'No para aquí', sinDatos: 'Horario' }[x.estado];
      var horas = (x.est !== x.prog && !anulado) ? '<s>' + hhmm(x.prog) + '</s> ' + hhmm(x.est) : hhmm(x.prog);
      var cl = datos.colores && datos.colores[x.tr.l] ? '#' + datos.colores[x.tr.l] : '#556070';
      var sitio = x.ahoraEn && !anulado && datos.paradas[x.ahoraEn] ? '<div class="ahora">Próxima parada: ' + esc(datos.paradas[x.ahoraEn]) + '</div>' : '';
      return '<div class="fila' + (anulado ? ' anulado' : '') + '">' +
        '<div class="cuenta"><div class="num' + (cuenta.indexOf(':') >= 0 ? ' hora' : '') + '" style="color:' + color + '">' + cuenta + '</div>' +
        (!anulado && min > 0 && min < 60 ? '<div class="min">min</div>' : '') + '</div>' +
        '<div class="info"><div class="destino">' + esc(x.tr.d) + '</div>' +
        '<div class="horas">' + horas + ' · <span class="linea" style="background:' + cl + '">' + esc(x.tr.l) + '</span> ' + esc(x.tr.n) + '</div>' + sitio + '</div>' +
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
  function refrescar() {
    if (cargando) return; cargando = true;
    var pideHorario = !datos || Date.now() - new Date(datos.generado).getTime() > 6 * 3600000;
    (pideHorario ? bajar('/horario').then(function (h) { datos = h; }).catch(function () { if (!datos) throw new Error('No se pudo descargar el horario'); }) : Promise.resolve())
      .then(function () {
        return Promise.all([
          bajar('/vivo').then(function (f) { feedVivo = f; actualizado = Date.now(); errorTxt = null; })
            .catch(function () { errorTxt = 'Renfe no responde: se muestra el horario sin retrasos'; }),
          bajar('/avisos').then(function (f) { feedAvisos = f; }).catch(function () {})
        ]);
      })
      .catch(function (e) { errorTxt = e.message || 'Sin conexión'; })
      .then(function () { cargando = false; if (datos) pintar(); else document.getElementById('lista').innerHTML = '<div class="vacio">' + esc(errorTxt || 'Sin datos') + '</div>'; });
  }

  document.getElementById('bS0').onclick = function () { elegirSentido(0); };
  document.getElementById('bS1').onclick = function () { elegirSentido(1); };
  document.getElementById('bAct').onclick = refrescar;
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refrescar(); });

  refrescar();
  setInterval(refrescar, CADA * 1000);
  setInterval(function () { if (datos) pintar(); }, 10000);
})();
</script>
</body>
</html>`;
