// App.tsx
// Próximos trenes en Barberà del Vallès con el retraso en directo de Renfe.

import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, FlatList, Platform, Pressable, RefreshControl, StatusBar as RNStatusBar, StyleSheet, Text, View } from 'react-native';
import { avisosR4, Horario, leerTiempoReal, proximosTrenes, Proximo } from './logica';

// CAMBIA "tivoglio33-cloud" si el repositorio está en otra cuenta
const URL_HORARIO = 'https://raw.githubusercontent.com/tivoglio33-cloud/tren-barbera/main/data/barbera.json';
const URL_VIVO = 'https://gtfsrt.renfe.com/trip_updates.json';
const URL_AVISOS = 'https://gtfsrt.renfe.com/alerts.json';
const CADA_SEGUNDOS = 30;

const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

async function bajarJson(url: string) {
  const r = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { headers: { 'Cache-Control': 'no-cache' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

export default function App() {
  const [horario, setHorario] = useState<Horario | null>(null);
  const [vivo, setVivo] = useState<ReturnType<typeof leerTiempoReal> | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [haciaBcn, setHaciaBcn] = useState(true);
  const [ahora, setAhora] = useState(Date.now());
  const [actualizado, setActualizado] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [verAvisos, setVerAvisos] = useState(false);
  const horarioRef = useRef<Horario | null>(null);

  const refrescar = useCallback(async () => {
    setCargando(true);
    try {
      let h = horarioRef.current;
      // El horario se vuelve a bajar si no lo tenemos o si tiene más de 6 horas
      if (!h || Date.now() - new Date(h.generado).getTime() > 6 * 3600 * 1000) {
        try {
          h = await bajarJson(URL_HORARIO);
          horarioRef.current = h;
          setHorario(h);
        } catch (e) {
          if (!h) throw new Error('No se pudo descargar el horario');
        }
      }
      const ids = h!.estacion.ids;
      const [tu, al] = await Promise.allSettled([bajarJson(URL_VIVO), bajarJson(URL_AVISOS)]);
      if (tu.status === 'fulfilled') {
        setVivo(leerTiempoReal(tu.value, ids));
        setActualizado(Date.now());
        setError(null);
      } else {
        setError('Renfe no responde: se muestra el horario sin retrasos');
      }
      if (al.status === 'fulfilled') setAvisos(avisosR4(al.value, ids));
    } catch (e: any) {
      setError(e?.message || 'Sin conexión');
    } finally {
      setCargando(false);
      setAhora(Date.now());
    }
  }, []);

  useEffect(() => {
    refrescar();
    const datos = setInterval(refrescar, CADA_SEGUNDOS * 1000);
    const reloj = setInterval(() => setAhora(Date.now()), 10 * 1000);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refrescar(); });
    return () => { clearInterval(datos); clearInterval(reloj); sub.remove(); };
  }, [refrescar]);

  const trenes = useMemo(() => {
    if (!horario) return [];
    return proximosTrenes(horario, vivo, ahora).filter((t) => t.haciaBcn === haciaBcn).slice(0, 10);
  }, [horario, vivo, ahora, haciaBcn]);

  const horarioViejo = horario && Date.now() - new Date(horario.generado).getTime() > 36 * 3600 * 1000;

  return (
    <View style={s.pantalla}>
      <StatusBar style="light" />
      <View style={s.cabecera}>
        <Text style={s.titulo}>Barberà del Vallès</Text>
        <Text style={s.subtitulo}>
          Rodalies R4 · {actualizado ? `en directo ${hhmm(actualizado)}` : 'cargando…'}
        </Text>
        <View style={s.selector}>
          <Pressable style={[s.opcion, haciaBcn && s.opcionActiva]} onPress={() => setHaciaBcn(true)}>
            <Text style={[s.opcionTxt, haciaBcn && s.opcionTxtActiva]}>→ Barcelona</Text>
          </Pressable>
          <Pressable style={[s.opcion, !haciaBcn && s.opcionActiva]} onPress={() => setHaciaBcn(false)}>
            <Text style={[s.opcionTxt, !haciaBcn && s.opcionTxtActiva]}>→ Sabadell / Terrassa</Text>
          </Pressable>
        </View>
      </View>

      {error && <Text style={s.error}>{error}</Text>}
      {horarioViejo && <Text style={s.error}>El horario guardado es de hace más de un día: puede no estar al día</Text>}

      {avisos.length > 0 && (
        <Pressable style={s.aviso} onPress={() => setVerAvisos(!verAvisos)}>
          <Text style={s.avisoTit}>⚠ {avisos.length === 1 ? 'Aviso de Renfe en la R4' : `${avisos.length} avisos de Renfe en la R4`} {verAvisos ? '▲' : '▼'}</Text>
          {verAvisos && avisos.map((a, i) => <Text key={i} style={s.avisoTxt}>{a}</Text>)}
        </Pressable>
      )}

      <FlatList
        data={trenes}
        keyExtractor={(t) => t.id}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={refrescar} />}
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        ListEmptyComponent={
          <Text style={s.vacio}>{horario ? 'No hay trenes en las próximas horas' : 'Cargando horario…'}</Text>
        }
        renderItem={({ item }) => <Fila tren={item} ahora={ahora} paradas={horario?.paradas || {}} />}
      />
      <Text style={s.pie}>Datos: Renfe (CC BY 4.0) · desliza hacia abajo para actualizar</Text>
    </View>
  );
}

function Fila({ tren, ahora, paradas }: { tren: Proximo; ahora: number; paradas: Record<string, string> }) {
  const min = Math.round((tren.estimado - ahora) / 60000);
  const anulado = tren.estado === 'cancelado' || tren.estado === 'noPara';
  const cuenta = anulado ? '—' : min <= 0 ? 'Ya' : min >= 60 ? hhmm(tren.estimado) : `${min}`;
  const color =
    tren.estado === 'retraso' ? (tren.retrasoMin >= 10 ? ROJO : AMBAR) : anulado ? ROJO : tren.estado === 'sinDatos' ? GRIS : VERDE;
  const etiqueta = {
    puntual: 'Puntual',
    retraso: `+${tren.retrasoMin} min`,
    adelanto: `${tren.retrasoMin} min`,
    cancelado: 'Cancelado',
    noPara: 'No para aquí',
    sinDatos: 'Horario',
  }[tren.estado];

  return (
    <View style={[s.fila, anulado && { opacity: 0.6 }]}>
      <View style={s.cuenta}>
        <Text style={[s.cuentaNum, { color }]}>{cuenta}</Text>
        {!anulado && min > 0 && min < 60 && <Text style={s.cuentaMin}>min</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.destino} numberOfLines={1}>{tren.destino}</Text>
        <Text style={s.horas}>
          {tren.estimado !== tren.programado && !anulado ? (
            <>
              <Text style={s.tachado}>{hhmm(tren.programado)}</Text>  {hhmm(tren.estimado)}
            </>
          ) : (
            hhmm(tren.programado)
          )}
          {'  ·  '}{tren.linea} {tren.numero}
        </Text>
        {tren.ahoraEn && !anulado && paradas[tren.ahoraEn] && (
          <Text style={s.ahoraEn} numberOfLines={1}>Próxima parada: {paradas[tren.ahoraEn]}</Text>
        )}
      </View>
      <View style={[s.badge, { borderColor: color }]}>
        <Text style={[s.badgeTxt, { color }]}>{etiqueta}</Text>
      </View>
    </View>
  );
}

const VERDE = '#3ddc84';
const AMBAR = '#ffb020';
const ROJO = '#ff5a5a';
const GRIS = '#8a94a6';

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: '#0f141c', paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight || 24 : 44 },
  cabecera: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, backgroundColor: '#161d28' },
  titulo: { color: '#fff', fontSize: 26, fontWeight: '700' },
  subtitulo: { color: '#a8b3c4', fontSize: 14, marginTop: 2 },
  selector: { flexDirection: 'row', marginTop: 12, backgroundColor: '#0f141c', borderRadius: 10, padding: 3 },
  opcion: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  opcionActiva: { backgroundColor: '#e2231a' },
  opcionTxt: { color: '#a8b3c4', fontWeight: '600', fontSize: 15 },
  opcionTxtActiva: { color: '#fff' },
  error: { color: '#1a1a1a', backgroundColor: AMBAR, padding: 10, fontSize: 14 },
  aviso: { backgroundColor: '#3a2a10', padding: 12, marginHorizontal: 12, marginTop: 10, borderRadius: 10 },
  avisoTit: { color: AMBAR, fontWeight: '700', fontSize: 15 },
  avisoTxt: { color: '#f0e2c8', fontSize: 14, marginTop: 8 },
  fila: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#161d28', borderRadius: 12, padding: 14, marginBottom: 10 },
  cuenta: { width: 70, alignItems: 'center' },
  cuentaNum: { fontSize: 30, fontWeight: '800' },
  cuentaMin: { color: '#a8b3c4', fontSize: 12, marginTop: -4 },
  destino: { color: '#fff', fontSize: 17, fontWeight: '600' },
  horas: { color: '#c9d2df', fontSize: 15, marginTop: 3 },
  tachado: { textDecorationLine: 'line-through', color: GRIS },
  ahoraEn: { color: GRIS, fontSize: 13, marginTop: 3 },
  badge: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8 },
  badgeTxt: { fontWeight: '700', fontSize: 13 },
  vacio: { color: GRIS, textAlign: 'center', marginTop: 40, fontSize: 16 },
  pie: { color: '#5c6678', fontSize: 11, textAlign: 'center', paddingBottom: 16 },
});
