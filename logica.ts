// logica.ts
// Cruza el horario (data/barbera.json) con el tiempo real de Renfe
// y devuelve la lista de próximos trenes en Barberà del Vallès.

export type TrenHorario = { t: string; n: string; l: string; s: number; d: string; b: number };
export type Horario = {
  generado: string;
  estacion: { ids: string[]; nombre: string };
  paradas: Record<string, string>;
  dias: Record<string, TrenHorario[]>;
};

export type EnVivo = {
  retraso: number | null; // segundos
  cancelado: boolean;
  noPara: boolean; // Renfe ha suprimido la parada en Barberà
  ahoraEn: string | null; // stop_id de la próxima parada que informa Renfe
  llegadaExacta: number | null; // ms, si la próxima parada es justo Barberà
};

export type Proximo = {
  id: string;
  numero: string;
  linea: string;
  destino: string;
  haciaBcn: boolean;
  programado: number; // ms
  estimado: number; // ms
  estado: 'puntual' | 'retraso' | 'adelanto' | 'cancelado' | 'noPara' | 'sinDatos';
  retrasoMin: number;
  ahoraEn: string | null;
};

// "5162L77412R4" -> "77412|R4" (número de tren + línea). El trip_id entero
// cambia cada día; esto sirve de respaldo si no casa el trip_id exacto.
function claveTren(tripId: string): string {
  const m = tripId.match(/^\d{4}[A-Z](\d+)([A-Za-z][A-Za-z0-9]*)$/);
  return m ? m[1] + '|' + m[2] : '';
}

// Lee trip_updates.json de Renfe y se queda con lo que toca a Barberà
export function leerTiempoReal(feed: any, idsBarbera: string[]): { porTrip: Map<string, EnVivo>; porNumero: Map<string, EnVivo> } {
  const porTrip = new Map<string, EnVivo>();
  const porNumero = new Map<string, EnVivo>();
  const entidades: any[] = (feed && feed.entity) || []; // de madrugada Renfe no manda "entity"
  for (const e of entidades) {
    const tu = e.tripUpdate;
    if (!tu || !tu.trip || !tu.trip.tripId) continue;
    const tripId: string = tu.trip.tripId;
    if (!tripId.startsWith('51')) continue; // solo Rodalies de Barcelona
    const stus: any[] = tu.stopTimeUpdate || [];
    const conHora = stus.find((x) => x.arrival);
    let retraso: number | null = tu.delay != null ? Number(tu.delay) : conHora ? Number(conHora.arrival.delay) : null;
    // Renfe a veces publica retrasos de casi -24 h (día equivocado): se descartan
    if (retraso != null && (isNaN(retraso) || Math.abs(retraso) > 4 * 3600)) retraso = null;
    const aqui = conHora && idsBarbera.includes(conHora.stopId) && conHora.arrival.time ? Number(conHora.arrival.time) * 1000 : null;
    const vivo: EnVivo = {
      retraso,
      cancelado: tu.trip.scheduleRelationship === 'CANCELED',
      noPara: stus.some((x) => x.scheduleRelationship === 'SKIPPED' && idsBarbera.includes(x.stopId)),
      ahoraEn: conHora ? conHora.stopId : null,
      llegadaExacta: aqui,
    };
    porTrip.set(tripId, vivo);
    const clave = claveTren(tripId);
    if (clave) porNumero.set(clave, vivo);
  }
  return { porTrip, porNumero };
}

function fechaLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function medianoche(fecha: string): number {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0).getTime();
}

export function proximosTrenes(horario: Horario, vivo: ReturnType<typeof leerTiempoReal> | null, ahora: number, cuantos = 10): Proximo[] {
  const hoy = new Date(ahora);
  const ayer = new Date(ahora - 86400000);
  const lista: Proximo[] = [];
  for (const fecha of [fechaLocal(ayer), fechaLocal(hoy), fechaLocal(new Date(ahora + 86400000))]) {
    const trenes = horario.dias[fecha];
    if (!trenes) continue;
    const base = medianoche(fecha);
    for (const tr of trenes) {
      const programado = base + tr.s * 1000;
      if (programado < ahora - 3 * 3600 * 1000 || programado > ahora + 6 * 3600 * 1000) continue;
      const v = vivo ? vivo.porTrip.get(tr.t) || vivo.porNumero.get(claveTren(tr.t)) : undefined;
      let estimado = programado;
      let estado: Proximo['estado'] = 'sinDatos';
      let retrasoMin = 0;
      if (v) {
        if (v.cancelado) estado = 'cancelado';
        else if (v.noPara) estado = 'noPara';
        else if (v.llegadaExacta != null) estimado = v.llegadaExacta;
        else if (v.retraso != null) estimado = programado + v.retraso * 1000;
        if (estado === 'sinDatos') {
          retrasoMin = Math.round((estimado - programado) / 60000);
          estado = retrasoMin >= 2 ? 'retraso' : retrasoMin <= -2 ? 'adelanto' : 'puntual';
          if (v.retraso == null && v.llegadaExacta == null) estado = 'sinDatos';
        }
      }
      // ya ha pasado (se deja 1 minuto de margen)
      if (estimado < ahora - 60 * 1000) continue;
      lista.push({
        id: fecha + tr.t,
        numero: tr.n,
        linea: tr.l,
        destino: tr.d,
        haciaBcn: tr.b === 1,
        programado,
        estimado,
        estado,
        retrasoMin,
        ahoraEn: v && v.ahoraEn ? v.ahoraEn : null,
      });
    }
  }
  lista.sort((a, b) => a.estimado - b.estimado);
  return lista.slice(0, cuantos * 3);
}

// Avisos de Renfe que afecten a la R4 o a Barberà
export function avisosR4(feed: any, idsBarbera: string[]): string[] {
  const out: string[] = [];
  for (const e of (feed && feed.entity) || []) {
    const a = e.alert;
    if (!a) continue;
    const afecta = (a.informedEntity || []).some(
      (ie: any) => (typeof ie.routeId === 'string' && ie.routeId.startsWith('51') && /R4$/.test(ie.routeId.trim())) || idsBarbera.includes(ie.stopId)
    );
    if (!afecta) continue;
    const tr = (a.descriptionText && a.descriptionText.translation) || (a.headerText && a.headerText.translation) || [];
    const txt = (tr.find((x: any) => x.language === 'es') || tr[0] || {}).text;
    if (txt && !out.includes(txt.trim())) out.push(txt.trim());
  }
  return out;
}
