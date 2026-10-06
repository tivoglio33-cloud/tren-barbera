// scripts/bus.js
// Genera, a partir del horario de T-mobilitat (GTFS completo de la ATM), los
// horarios de las paradas de bus de Barbera, Badia y Sabadell (Moventis y TUS):
//   data/bus/paradas.json  -> lista de paradas (nombre, codigo del cartel, zona, lineas, posicion)
//   data/bus/p/<parada>.json -> las salidas de cada parada, de ayer a dentro de 14 dias
// Lo ejecuta el workflow .github/workflows/bus.yml cada madrugada.
// Uso: node scripts/bus.js <carpeta_gtfs_descomprimido> <carpeta_salida>

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ------------------------------------------------------------------
// QUE OPERADORES SE GUARDAN
// Se compara con el nombre y el codigo del operador (agency.txt), sin acentos
// y en minusculas. Para anadir uno, anade un trozo de su nombre a la lista.
// ------------------------------------------------------------------
const OPERADORES = ['tus', 'transports urbans de sabadell', 'sarbus', 'moventis', 'vallesana'];

// ------------------------------------------------------------------
// ZONAS: centro aproximado y radio en km. Cada parada va a la zona que le
// queda "mas cerca" en proporcion a su radio; las que caen lejos de las tres
// no se guardan (asi no entran las paradas de Barcelona de la A1 o la A2).
// ------------------------------------------------------------------
const ZONAS = [
  { nombre: 'Barber\u00e0', lat: 41.5159, lon: 2.1246, radio: 1.7 },
  { nombre: 'Badia', lat: 41.5072, lon: 2.1153, radio: 0.75 },
  { nombre: 'Sabadell', lat: 41.5463, lon: 2.1086, radio: 3.6 },
];
const MARGEN = 1.15; // 1 = justo el radio; un poco mas para no dejar fuera las de las afueras

let GTFS = process.argv[2] || 'gtfs';
const SALIDA = path.join(process.argv[3] || 'data', 'bus');
const DIAS_ATRAS = 1; // ayer: por los buses de despues de medianoche
const DIAS_ADELANTE = 14; // dos semanas, por si alguna noche falla la actualizacion

if (!fs.existsSync(path.join(GTFS, 'stops.txt'))) {
  const sub = fs.readdirSync(GTFS).map((d) => path.join(GTFS, d)).find((d) => fs.existsSync(path.join(d, 'stops.txt')));
  if (sub) GTFS = sub;
}

// ---------- utilidades ----------

function norm(t) {
  return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function partirLinea(linea) {
  const out = [];
  let actual = '';
  let enComillas = false;
  for (const c of linea) {
    if (c === '"') enComillas = !enComillas;
    else if (c === ',' && !enComillas) { out.push(actual.trim()); actual = ''; }
    else actual += c;
  }
  out.push(actual.trim());
  return out;
}

// Lee un .txt del GTFS linea a linea (algunos son enormes) y llama a "cada" con cada fila
async function recorrer(archivo, cada) {
  const ruta = path.join(GTFS, archivo);
  if (!fs.existsSync(ruta)) return false;
  const rl = readline.createInterface({ input: fs.createReadStream(ruta, 'utf8'), crlfDelay: Infinity });
  let cab = null;
  for await (const bruta of rl) {
    const l = bruta.replace(/^\ufeff/, '');
    if (!l.trim()) continue;
    if (!cab) { cab = partirLinea(l); continue; }
    const v = partirLinea(l);
    const o = {};
    cab.forEach((k, i) => { o[k] = v[i] ?? ''; });
    cada(o);
  }
  return true;
}

function aSegundos(hms) {
  const [h, m, s] = String(hms).trim().split(':').map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

function fechaMadrid(dias) {
  const d = new Date(Date.now() + dias * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(d);
}

function fechaGtfsAIso(f) {
  return `${f.slice(0, 4)}-${f.slice(4, 6)}-${f.slice(6, 8)}`;
}

// Compara por palabras enteras: "tus" no debe colarse dentro de otra palabra
function contiene(texto, trozo) {
  const t = ' ' + norm(texto).replace(/[^a-z0-9]+/g, ' ') + ' ';
  return t.includes(' ' + norm(trozo).replace(/[^a-z0-9]+/g, ' ') + ' ');
}

function km(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const x = (lon2 - lon1) * r * Math.cos(((lat1 + lat2) / 2) * r);
  const y = (lat2 - lat1) * r;
  return Math.sqrt(x * x + y * y) * 6371;
}

function zonaDe(lat, lon) {
  let mejor = -1, valor = Infinity;
  ZONAS.forEach((z, i) => {
    const v = km(lat, lon, z.lat, z.lon) / z.radio;
    if (v < valor) { valor = v; mejor = i; }
  });
  return valor <= MARGEN ? mejor : -1;
}

// Nombre de archivo seguro para cada parada
function archivoDe(stopId) {
  return String(stopId).replace(/[^A-Za-z0-9_-]/g, '_');
}

// Quita del destino el nombre del municipio repetido y espacios de mas
function limpiarDestino(t) {
  return arreglarNombre(String(t || '').replace(/\s+/g, ' ').trim());
}

// Moventis escribe "Carrer De Girona/avinguda D\u00b4ll\u00e0": se pasa a "Carrer de Girona / Avinguda d'...".
function arreglarNombre(t) {
  return String(t || '')
    .replace(/[\u00b4`]/g, "'")
    .replace(/\s*\/\s*(.)/g, (m, c) => ' / ' + c.toUpperCase())
    .replace(/ (De|Del|Dels|Des|La|Les|Els|El|I|A) /g, (m, p) => ' ' + p.toLowerCase() + ' ')
    .replace(/ (D|L)'/g, (m, p) => ' ' + p.toLowerCase() + "'")
    .trim();
}

// ---------- programa ----------

async function main() {
  // 1) Operadores
  const agencias = {};
  await recorrer('agency.txt', (a) => { agencias[a.agency_id || '_'] = a.agency_name; });
  console.log('Operadores en el GTFS:', Object.entries(agencias).map(([id, n]) => `${id}=${n}`).join(' | '));
  const agenciasBuenas = new Set(
    Object.entries(agencias)
      .filter(([id, n]) => OPERADORES.some((o) => contiene(n, o) || contiene(id, o)))
      .map(([id]) => id)
  );
  console.log('Operadores elegidos:', [...agenciasBuenas].map((id) => `${id}=${agencias[id]}`).join(' | ') || '(ninguno)');
  if (!agenciasBuenas.size) throw new Error('No encuentro ni TUS ni Moventis en agency.txt: mira la lista de arriba y corrige OPERADORES');
  const unSoloOperador = Object.keys(agencias).length === 1;

  // 2) Lineas de esos operadores (solo bus)
  const lineas = {};
  await recorrer('routes.txt', (r) => {
    const ag = r.agency_id || '_';
    if (!agenciasBuenas.has(ag) && !unSoloOperador) return;
    if (r.route_type && !['3', '700', '701', '702', '704', '715'].includes(r.route_type)) return;
    lineas[r.route_id] = {
      nombre: r.route_short_name || r.route_long_name || r.route_id,
      color: (r.route_color || '').replace('#', ''),
      texto: (r.route_text_color || '').replace('#', ''),
      op: contiene(agencias[ag], 'tus') || contiene(ag, 'tus') || contiene(agencias[ag], 'urbans de sabadell') ? 'TUS' : 'Moventis',
    };
  });
  // Si TUS y Moventis tienen una linea con el mismo nombre (L1, L4...), la de Moventis
  // se guarda por dentro como "M-L1" para no mezclarlas (en pantalla sigue saliendo "L1")
  const nombresTus = new Set(Object.values(lineas).filter((r) => r.op === 'TUS').map((r) => r.nombre));
  for (const r of Object.values(lineas)) r.clave = r.op !== 'TUS' && nombresTus.has(r.nombre) ? 'M-' + r.nombre : r.nombre;
  console.log('Lineas de bus de esos operadores:', Object.keys(lineas).length);

  // 3) Dias que nos interesan y calendario
  const diasQueremos = new Set();
  for (let i = -DIAS_ATRAS; i <= DIAS_ADELANTE; i++) diasQueremos.add(fechaMadrid(i));
  const fechasDeServicio = {};
  const diasSemana = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  await recorrer('calendar.txt', (c) => {
    const ini = new Date(fechaGtfsAIso(c.start_date) + 'T12:00:00Z');
    const fin = new Date(fechaGtfsAIso(c.end_date) + 'T12:00:00Z');
    const lista = [];
    for (const iso of diasQueremos) {
      const d = new Date(iso + 'T12:00:00Z');
      if (d >= ini && d <= fin && c[diasSemana[d.getUTCDay()]] === '1') lista.push(iso);
    }
    if (lista.length) fechasDeServicio[c.service_id] = lista;
  });
  await recorrer('calendar_dates.txt', (cd) => {
    const iso = fechaGtfsAIso(cd.date);
    if (!diasQueremos.has(iso)) return;
    const lista = fechasDeServicio[cd.service_id] || (fechasDeServicio[cd.service_id] = []);
    if (cd.exception_type === '1' && !lista.includes(iso)) lista.push(iso);
    if (cd.exception_type === '2') fechasDeServicio[cd.service_id] = lista.filter((x) => x !== iso);
  });

  // 4) Viajes de esas lineas en esos dias
  const viajes = {};
  await recorrer('trips.txt', (t) => {
    if (!lineas[t.route_id]) return;
    const fechas = fechasDeServicio[t.service_id];
    if (!fechas || !fechas.length) return;
    viajes[t.trip_id] = { ruta: t.route_id, fechas, cartel: t.trip_headsign || '', paradas: [] };
  });
  console.log('Viajes en los dias elegidos:', Object.keys(viajes).length);
  if (!Object.keys(viajes).length) throw new Error('Ningun viaje de TUS ni Moventis en estos dias: algo ha cambiado en el GTFS');

  // 5) Paradas (solo las de las tres zonas)
  // Tambien se apuntan las paradas del AMB: el numero que sale en el cartel de las
  // marquesinas de Barbera y Badia (p. ej. 201408) es el del AMB, no el de Moventis
  const paradas = {};
  const rejillaAmb = {}; // casillas de unos 100 m con las paradas del AMB que caen dentro
  const casilla = (lat, lon) => Math.floor(lat * 1000) + ':' + Math.floor(lon * 1000);
  await recorrer('stops.txt', (s) => {
    const lat = Number(s.stop_lat), lon = Number(s.stop_lon);
    if (!isFinite(lat) || !isFinite(lon)) return;
    const zona = zonaDe(lat, lon);
    paradas[s.stop_id] = { id: s.stop_id, codigo: s.stop_code || '', nombre: s.stop_name, lat, lon, zona };
    if (zona >= 0 && /^AMB_/.test(s.stop_id) && s.stop_code) {
      const k = casilla(lat, lon);
      (rejillaAmb[k] || (rejillaAmb[k] = [])).push({ codigo: s.stop_code, nombre: s.stop_name, lat, lon });
    }
  });
  // La parada del AMB que esta en el mismo sitio (a menos de 30 m), si la hay
  function ambCercana(par) {
    let mejor = null, dmin = 0.03;
    const la = Math.floor(par.lat * 1000), lo = Math.floor(par.lon * 1000);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const a of rejillaAmb[(la + i) + ':' + (lo + j)] || []) {
        const d = km(par.lat, par.lon, a.lat, a.lon);
        if (d < dmin) { dmin = d; mejor = a; }
      }
    }
    return mejor;
  }

  // 6) stop_times: es enorme, se lee linea a linea y solo se guarda lo de nuestros viajes
  await recorrer('stop_times.txt', (o) => {
    const v = viajes[o.trip_id];
    if (!v) return;
    v.paradas.push({ seq: Number(o.stop_sequence), stop: o.stop_id, hora: o.departure_time || o.arrival_time, sube: o.pickup_type !== '1' });
  });

  // 7) Para cada parada de nuestras zonas, sus salidas
  const porParada = {}; // stopId -> { lineas:Set, salidas: {fecha: [[s, linea, destino]]} }
  for (const v of Object.values(viajes)) {
    if (!v.paradas.length) continue;
    v.paradas.sort((a, b) => a.seq - b.seq);
    const ultima = v.paradas[v.paradas.length - 1];
    const linea = lineas[v.ruta];
    // TUS pone bien el destino en el cartel. Moventis pone siglas tipo "BDV - SBD (P. TAULI)",
    // asi que para Moventis se usa el nombre de la ultima parada del viaje
    const usarCartel = v.cartel && linea.op === 'TUS';
    const destino = limpiarDestino(usarCartel ? v.cartel : (paradas[ultima.stop] && paradas[ultima.stop].nombre) || v.cartel);
    v.paradas.forEach((p, i) => {
      if (i === v.paradas.length - 1 || !p.sube || !p.hora) return; // la ultima parada no es una salida
      const par = paradas[p.stop];
      if (!par || par.zona < 0) return;
      const pp = porParada[p.stop] || (porParada[p.stop] = { lineas: new Set(), salidas: {}, destinos: {} });
      pp.lineas.add(linea.clave);
      pp.destinos[destino] = (pp.destinos[destino] || 0) + v.fechas.length;
      const s = aSegundos(p.hora);
      for (const f of v.fechas) (pp.salidas[f] || (pp.salidas[f] = [])).push([s, linea.clave, destino]);
    });
  }

  // 8) Escribir
  fs.rmSync(SALIDA, { recursive: true, force: true });
  fs.mkdirSync(path.join(SALIDA, 'p'), { recursive: true });
  const indice = { generado: new Date().toISOString(), zonas: ZONAS.map((z) => z.nombre), lineas: {}, paradas: [] };
  const lineasUsadas = new Set();
  const porZona = [0, 0, 0];
  let total = 0, conAmb = 0;

  for (const [stopId, pp] of Object.entries(porParada)) {
    const par = paradas[stopId];
    const nombresLinea = [...pp.lineas].sort((a, b) => a.replace(/^M-/, '').localeCompare(b.replace(/^M-/, ''), 'es', { numeric: true }));
    nombresLinea.forEach((n) => lineasUsadas.add(n));
    // Lineas y destinos van numerados para que el archivo pese menos
    const L = [], D = [];
    const dias = {};
    for (const [f, lista] of Object.entries(pp.salidas)) {
      lista.sort((a, b) => a[0] - b[0]);
      dias[f] = lista.map(([s, l, d]) => {
        let li = L.indexOf(l); if (li < 0) { L.push(l); li = L.length - 1; }
        let di = D.indexOf(d); if (di < 0) { D.push(d); di = D.length - 1; }
        return [s, li, di];
      });
      total += lista.length;
    }
    const f = archivoDe(stopId);
    fs.writeFileSync(path.join(SALIDA, 'p', f + '.json'), JSON.stringify({ id: stopId, L, D, dias }));
    // Si en el mismo sitio hay una parada del AMB, se usan su numero (el del cartel) y su nombre (mejor escrito)
    const amb = ambCercana(par);
    if (amb) conAmb++;
    const hacia = Object.entries(pp.destinos).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([d]) => d);
    const fila = {
      f, c: amb ? amb.codigo : par.codigo, n: amb ? amb.nombre : arreglarNombre(par.nombre), z: par.zona, l: nombresLinea, h: hacia,
      la: Math.round(par.lat * 1e5) / 1e5, lo: Math.round(par.lon * 1e5) / 1e5,
    };
    if (amb && par.codigo && par.codigo !== amb.codigo) fila.c2 = par.codigo; // el numero de Moventis, por si alguien lo busca
    indice.paradas.push(fila);
    porZona[par.zona]++;
  }
  for (const r of Object.values(lineas)) {
    if (!lineasUsadas.has(r.clave) || indice.lineas[r.clave]) continue;
    indice.lineas[r.clave] = { n: r.nombre, c: r.color, t: r.texto, op: r.op };
  }
  indice.paradas.sort((a, b) => a.z - b.z || a.n.localeCompare(b.n, 'es'));
  fs.writeFileSync(path.join(SALIDA, 'paradas.json'), JSON.stringify(indice));

  console.log(`Paradas guardadas: ${indice.paradas.length} (${ZONAS.map((z, i) => z.nombre + ' ' + porZona[i]).join(', ')})`);
  console.log('Lineas:', Object.keys(indice.lineas).sort((a, b) => a.localeCompare(b, 'es', { numeric: true })).map((n) => `${n} (${indice.lineas[n].op})`).join(', '));
  console.log('Salidas guardadas en total:', total, '| paradas con numero del AMB:', conAmb);
  if (!indice.paradas.length) throw new Error('Ninguna parada en Barbera, Badia ni Sabadell: revisa ZONAS');
}

main().catch((e) => { console.error(e); process.exit(1); });
