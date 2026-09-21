// scripts/horario.js
// Genera data/barbera.json con el horario de los trenes que paran en
// Barberà del Vallès, a partir del GTFS de Renfe Cercanías (fomento_transit.zip).
// Lo ejecuta el workflow .github/workflows/horario.yml cada madrugada.
// Uso: node scripts/horario.js <carpeta_gtfs_descomprimido> <archivo_salida>

const fs = require('fs');
const path = require('path');
const readline = require('readline');

let GTFS = process.argv[2] || 'gtfs';
// Si el zip trae los .txt dentro de una subcarpeta, se busca ahí
if (!fs.existsSync(path.join(GTFS, 'stops.txt'))) {
  const sub = fs.readdirSync(GTFS).map((d) => path.join(GTFS, d)).find((d) => fs.existsSync(path.join(d, 'stops.txt')));
  if (sub) GTFS = sub;
}
const SALIDA = process.argv[3] || 'data/barbera.json';
const NUCLEO = '51'; // 51 = Rodalies de Barcelona (primeros dos caracteres del trip_id)
const DIAS_ATRAS = 1; // ayer: por los trenes de después de medianoche
const DIAS_ADELANTE = 3; // hoy + 3 días, por si una noche falla la actualización

// ---------- utilidades ----------

function sinAcentos(t) {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Renfe rellena cabeceras y valores con espacios: se limpia todo con trim()
function partirLinea(linea) {
  // El GTFS de Renfe no usa comillas con comas dentro, pero por si acaso:
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

// Fecha YYYY-MM-DD en hora de Madrid, desplazada "dias" días
function fechaMadrid(dias) {
  const d = new Date(Date.now() + dias * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(d);
}

function fechaGtfsAIso(f) {
  return `${f.slice(0, 4)}-${f.slice(4, 6)}-${f.slice(6, 8)}`;
}

// ---------- programa ----------

async function main() {
  // 1) Paradas
  const paradas = {};
  for (const s of leerCsv('stops.txt')) paradas[s.stop_id] = s.stop_name;

  const idsBarbera = Object.keys(paradas).filter((id) => sinAcentos(paradas[id]).includes('barbera'));
  if (idsBarbera.length === 0) throw new Error('No encuentro Barberà en stops.txt');
  console.log('Barberà =', idsBarbera.map((id) => `${id} (${paradas[id]})`).join(', '));

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

  // 4) Líneas y viajes de Rodalies de los días que interesan
  const lineas = {};
  for (const r of leerCsv('routes.txt')) lineas[r.route_id] = r.route_short_name;

  const viajes = {};
  for (const t of leerCsv('trips.txt')) {
    if (!t.trip_id.startsWith(NUCLEO)) continue;
    if (!fechasDeServicio[t.service_id]) continue;
    viajes[t.trip_id] = { linea: lineas[t.route_id] || '', servicio: t.service_id, paradas: [] };
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

  // 6) Trenes que paran en Barberà
  const dias = {};
  const paradasUsadas = new Set(idsBarbera);
  for (const [tripId, v] of Object.entries(viajes)) {
    v.paradas.sort((a, b) => a.seq - b.seq);
    const i = v.paradas.findIndex((p) => idsBarbera.includes(p.stop));
    if (i === -1) continue;
    if (i === v.paradas.length - 1) continue; // termina aquí: no sirve para subir
    const despues = v.paradas.slice(i + 1);
    const haciaBcn = despues.some((p) => sinAcentos(paradas[p.stop] || '').includes('barcelona'));
    const destino = paradas[v.paradas[v.paradas.length - 1].stop] || '';
    v.paradas.forEach((p) => paradasUsadas.add(p.stop));
    const numero = (tripId.match(/^\d{4}[A-Z](\d+)[A-Za-z]/) || [])[1] || '';
    for (const fecha of fechasDeServicio[v.servicio]) {
      (dias[fecha] || (dias[fecha] = [])).push({
        t: tripId, // trip_id (el mismo que usa el tiempo real)
        n: numero, // número de tren
        l: v.linea, // R4...
        s: aSegundos(v.paradas[i].llegada), // segundos desde las 00:00 del día de servicio
        d: destino,
        b: haciaBcn ? 1 : 0,
      });
    }
  }
  for (const f of Object.keys(dias)) dias[f].sort((a, b) => a.s - b.s);

  const nombres = {};
  for (const id of paradasUsadas) nombres[id] = paradas[id];

  const salida = {
    generado: new Date().toISOString(),
    estacion: { ids: idsBarbera, nombre: paradas[idsBarbera[0]] },
    paradas: nombres,
    dias,
  };
  fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
  fs.writeFileSync(SALIDA, JSON.stringify(salida));
  for (const f of Object.keys(dias).sort()) console.log(`  ${f}: ${dias[f].length} trenes`);
  if (!Object.keys(dias).length) throw new Error('Ningún tren encontrado: algo ha cambiado en el GTFS');
  console.log('Guardado', SALIDA, fs.statSync(SALIDA).size, 'bytes');
}

main().catch((e) => { console.error(e); process.exit(1); });
