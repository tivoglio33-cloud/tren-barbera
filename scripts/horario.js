// scripts/horario.js
// Genera, a partir del GTFS de Renfe Cercanías (fomento_transit.zip):
//   data/estaciones.json -> horario de TODAS las estaciones de la lista ESTACIONES (lo usa la web)
//   data/barbera.json    -> solo Barberà, con el formato antiguo (lo usa la versión app, App.tsx)
// Lo ejecuta el workflow .github/workflows/horario.yml cada madrugada.
// Uso: node scripts/horario.js <carpeta_gtfs_descomprimido> <carpeta_salida>

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ------------------------------------------------------------------
// LISTA DE ESTACIONES  (para añadir una, copia un bloque y cámbialo)
//   id       -> nombre corto interno, sin espacios ni acentos
//   busca    -> un trozo del nombre de la estación tal como lo escribe Renfe
//               (se compara sin acentos y en minúsculas)
//   sentidos -> los dos botones. Un tren va en el PRIMER sentido si, después
//               de esta estación, pasa por alguna parada que contenga una de
//               las palabras de "por". Si no, va en el segundo.
// ------------------------------------------------------------------
const ESTACIONES = [
  {
    id: 'barbera',
    busca: 'barbera del valles',
    sentidos: [
      { nombre: '→ Barcelona', por: ['barcelona'] },
      { nombre: '→ Sabadell / Terrassa' },
    ],
  },
  {
    id: 'sagrera',
    busca: 'sagrera-meridiana',
    sentidos: [
      { nombre: '→ Arc de Triomf / Sants', por: ['arc de triomf', 'placa de catalunya', 'sants', 'clot', 'passeig de gracia', 'estacio de franca'] },
      { nombre: '→ Fabra i Puig / Vallès' },
    ],
  },
];

let GTFS = process.argv[2] || 'gtfs';
const SALIDA = process.argv[3] || 'data';
const NUCLEO = '51'; // 51 = Rodalies de Barcelona (primeros dos caracteres del trip_id)
const DIAS_ATRAS = 1; // ayer: por los trenes de después de medianoche
const DIAS_ADELANTE = 3; // hoy + 3 días, por si una noche falla la actualización

// Si el zip trae los .txt dentro de una subcarpeta, se busca ahí
if (!fs.existsSync(path.join(GTFS, 'stops.txt'))) {
  const sub = fs.readdirSync(GTFS).map((d) => path.join(GTFS, d)).find((d) => fs.existsSync(path.join(d, 'stops.txt')));
  if (sub) GTFS = sub;
}

// ---------- utilidades ----------

function norm(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Renfe rellena cabeceras y valores con espacios: se limpia todo con trim()
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

function leerCsv(archivo) {
  const texto = fs.readFileSync(path.join(GTFS, archivo), 'utf8').replace(/^﻿/, '');
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim() !== '');
  const cab = partirLinea(lineas[0]);
  return lineas.slice(1).map((l) => {
    const v = partirLinea(l);
    const o = {};
    cab.forEach((k, i) => { o[k] = v[i] ?? ''; });
    return o;
  });
}

function aSegundos(hms) {
  const [h, m, s] = hms.trim().split(':').map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

function fechaMadrid(dias) {
  const d = new Date(Date.now() + dias * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(d);
}

function fechaGtfsAIso(f) {
  return `${f.slice(0, 4)}-${f.slice(4, 6)}-${f.slice(6, 8)}`;
}

// ---------- programa ----------

async function main() {
  // 1) Paradas y estaciones de la lista
  const paradas = {};
  for (const s of leerCsv('stops.txt')) paradas[s.stop_id] = s.stop_name;

  for (const e of ESTACIONES) {
    e.ids = Object.keys(paradas).filter((id) => norm(paradas[id]).includes(norm(e.busca)));
    if (e.ids.length === 0) throw new Error(`No encuentro "${e.busca}" en stops.txt`);
    console.log(`Estación ${e.id} = ${e.ids.map((id) => `${id} (${paradas[id]})`).join(', ')}`);
  }
  // Ayuda para añadir estaciones: nombres parecidos que existen
  const parecidas = Object.keys(paradas).filter((id) => norm(paradas[id]).includes('sagrera'));
  console.log('Paradas con "sagrera" en el nombre:', parecidas.map((id) => `${id} (${paradas[id]})`).join(', '));

  // 2) Días que nos interesan
  const diasQueremos = new Set();
  for (let i = -DIAS_ATRAS; i <= DIAS_ADELANTE; i++) diasQueremos.add(fechaMadrid(i));

  // 3) Calendario: service_id -> lista de fechas
  const fechasDeServicio = {};
  const diasSemana = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (const c of leerCsv('calendar.txt')) {
    const ini = new Date(fechaGtfsAIso(c.start_date) + 'T12:00:00Z');
    const fin = new Date(fechaGtfsAIso(c.end_date) + 'T12:00:00Z');
    const lista = [];
    for (let d = new Date(ini); d <= fin; d = new Date(d.getTime() + 86400000)) {
      const iso = d.toISOString().slice(0, 10);
      if (c[diasSemana[d.getUTCDay()]] === '1' && diasQueremos.has(iso)) lista.push(iso);
    }
    if (lista.length) fechasDeServicio[c.service_id] = lista;
  }
  if (fs.existsSync(path.join(GTFS, 'calendar_dates.txt'))) {
    for (const cd of leerCsv('calendar_dates.txt')) {
      const iso = fechaGtfsAIso(cd.date);
      if (!diasQueremos.has(iso)) continue;
      const lista = fechasDeServicio[cd.service_id] || (fechasDeServicio[cd.service_id] = []);
      if (cd.exception_type === '1' && !lista.includes(iso)) lista.push(iso);
      if (cd.exception_type === '2') fechasDeServicio[cd.service_id] = lista.filter((x) => x !== iso);
    }
  }

  // 4) Líneas (con su color) y viajes de Rodalies de esos días
  const lineas = {};
  for (const r of leerCsv('routes.txt')) lineas[r.route_id] = { nombre: r.route_short_name, color: r.route_color || '' };

  const viajes = {};
  for (const t of leerCsv('trips.txt')) {
    if (!t.trip_id.startsWith(NUCLEO)) continue;
    if (!fechasDeServicio[t.service_id]) continue;
    viajes[t.trip_id] = { linea: lineas[t.route_id] || { nombre: '', color: '' }, servicio: t.service_id, paradas: [] };
  }
  console.log('Viajes de Rodalies en los días elegidos:', Object.keys(viajes).length);

  // 5) stop_times.txt es enorme: se lee línea a línea
  const rl = readline.createInterface({ input: fs.createReadStream(path.join(GTFS, 'stop_times.txt'), 'utf8'), crlfDelay: Infinity });
  let cab = null;
  for await (const bruta of rl) {
    const l = bruta.replace(/^﻿/, '');
    if (!cab) { cab = partirLinea(l); continue; }
    if (!l.trim().startsWith(NUCLEO)) continue;
    const v = partirLinea(l);
    const o = {};
    cab.forEach((k, i) => { o[k] = v[i] ?? ''; });
    const viaje = viajes[o.trip_id];
    if (!viaje) continue;
    viaje.paradas.push({ seq: Number(o.stop_sequence), stop: o.stop_id, llegada: o.arrival_time || o.departure_time });
  }
  for (const v of Object.values(viajes)) v.paradas.sort((a, b) => a.seq - b.seq);

  // 6) Para cada estación, los trenes que paran en ella
  const paradasUsadas = new Set();
  const coloresLinea = {};
  const salida = { generado: new Date().toISOString(), estaciones: [], paradas: {}, colores: {} };

  for (const e of ESTACIONES) {
    const dias = {};
    const lineasAqui = new Set();
    for (const [tripId, v] of Object.entries(viajes)) {
      const i = v.paradas.findIndex((p) => e.ids.includes(p.stop));
      if (i === -1 || i === v.paradas.length - 1) continue; // no para, o termina aquí
      const despues = v.paradas.slice(i + 1);
      const claves = e.sentidos[0].por || [];
      const sentido = despues.some((p) => claves.some((k) => norm(paradas[p.stop]).includes(k))) ? 0 : 1;
      const destino = paradas[v.paradas[v.paradas.length - 1].stop] || '';
      v.paradas.forEach((p) => paradasUsadas.add(p.stop));
      lineasAqui.add(v.linea.nombre);
      if (v.linea.color) coloresLinea[v.linea.nombre] = v.linea.color;
      const numero = (tripId.match(/^\d{4}[A-Z](\d+)[A-Za-z]/) || [])[1] || '';
      for (const fecha of fechasDeServicio[v.servicio]) {
        (dias[fecha] || (dias[fecha] = [])).push({
          t: tripId, // trip_id (el mismo que usa el tiempo real)
          n: numero, // número de tren
          l: v.linea.nombre, // R4, R3...
          s: aSegundos(v.paradas[i].llegada), // segundos desde las 00:00 del día de servicio
          d: destino,
          b: sentido, // 0 = primer botón, 1 = segundo
        });
      }
    }
    for (const f of Object.keys(dias)) dias[f].sort((a, b) => a.s - b.s);
    if (!Object.keys(dias).length) throw new Error(`Ningún tren encontrado en ${e.id}: algo ha cambiado en el GTFS`);
    const lineasOrden = [...lineasAqui].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
    salida.estaciones.push({ id: e.id, nombre: paradas[e.ids[0]], ids: e.ids, lineas: lineasOrden, sentidos: e.sentidos.map((s) => s.nombre), dias });
    console.log(`  ${e.id} (${lineasOrden.join(', ')}):`);
    for (const f of Object.keys(dias).sort()) {
      const s0 = dias[f].filter((x) => x.b === 0).length;
      console.log(`    ${f}: ${dias[f].length} trenes (${s0} ${e.sentidos[0].nombre} / ${dias[f].length - s0} ${e.sentidos[1].nombre})`);
    }
  }
  for (const id of paradasUsadas) salida.paradas[id] = paradas[id];
  salida.colores = coloresLinea;

  fs.mkdirSync(SALIDA, { recursive: true });
  const f1 = path.join(SALIDA, 'estaciones.json');
  fs.writeFileSync(f1, JSON.stringify(salida));
  console.log('Guardado', f1, fs.statSync(f1).size, 'bytes');

  // Formato antiguo solo de Barberà (para la versión app). Allí b=1 era "hacia Barcelona".
  const bar = salida.estaciones.find((e) => e.id === 'barbera');
  if (bar) {
    const antiguo = {
      generado: salida.generado,
      estacion: { ids: bar.ids, nombre: bar.nombre },
      paradas: salida.paradas,
      dias: Object.fromEntries(Object.entries(bar.dias).map(([f, l]) => [f, l.map((x) => ({ ...x, b: x.b === 0 ? 1 : 0 }))])),
    };
    const f2 = path.join(SALIDA, 'barbera.json');
    fs.writeFileSync(f2, JSON.stringify(antiguo));
    console.log('Guardado', f2, fs.statSync(f2).size, 'bytes');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
