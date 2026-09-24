# Agregar un pasillo o atajo a la red

Los caminos peatonales que no vienen de QGIS (cruces de edificio, recorridos por una plazoleta, atajos) viven en una capa aparte. El grafo de la app los une solo a la red existente y los usa al calcular rutas. No hace falta editar `nodos` ni `aristas_red`, ni cambiar `graph.ts`, para cada atajo nuevo.

## Archivos

| Rol | Ruta |
| --- | --- |
| Fuente editable | `export/pasillos.geojson` |
| Copia que lee la app | `mobile/assets/geojson/pasillos.json` |
| Reproyección | `scripts/reproject_to_wgs84.py` |
| Unión al grafo | `mobile/src/routing/graph.ts` (`splicePassages`) |
| Dibujo en el mapa | `mobile/src/components/CampusMap.tsx` |

`mobile/assets/geojson/pasillos.json` se genera. El script lo vuelve a escribir entero. Cualquier cambio a mano ahí se pierde en la siguiente reproyección.

`export/aristas_red.geojson` y `export/nodos.geojson` siguen siendo el export de QGIS. Un reexport de QGIS no borra los atajos, porque están en `pasillos`.

## Sistema de coordenadas

`export/pasillos.geojson` usa el mismo plano que el resto de `export/`: metros, proyección `col_urban` del script.

```
+proj=col_urban +lat_0=3.44188333333333 +lon_0=-76.5205625
+x_0=1061900.18 +y_0=872364.63 +h_0=1000 +ellps=GRS80
+towgs84=0,0,0,0,0,0,0 +units=m +no_defs
```

El archivo declara `urn:ogc:def:crs:EPSG::6249`, pero la transformación real es ese `proj4`, no un EPSG genérico. Hay que usar el mismo `Transformer` que `scripts/reproject_to_wgs84.py`.

La app y el enganche al grafo trabajan en WGS84, después de reproyectar.

## Qué hace la app al cargar

1. Lee nodos y aristas de siempre.
2. Lee cada línea de `pasillos.json`.
3. Engancha cada extremo a la red:
   - a 4 m o menos de un nodo existente: usa ese nodo;
   - si no, a 12 m o menos de un tramo existente: parte ese tramo e inserta un nodo nuevo en el punto de corte;
   - más lejos: ese atajo no entra al grafo y ninguna ruta lo usa.
4. Agrega la línea como arista en ambos sentidos, salvo que `oneway` sea `"yes"`, `1` o `true`.
5. El costo de esa arista es `longitud_m`. Dijkstra suma ese valor al total de la ruta, igual que `longitud_m` de las aristas de QGIS. La pantalla muestra esa suma.

Los nodos creados al partir un tramo existen solo en memoria, al armar el grafo. No se escriben en `nodos.geojson`.

Si `longitud_m` falta o no es mayor que 0, el grafo usa la longitud haversine de la línea ya enganchada. Lo normal es guardar `longitud_m` en metros proyectados, para que coincida con QGIS.

## Cómo agregar uno

1. Elegir por dónde cruza y en qué caminos reales termina. Los extremos tienen que caer sobre un nodo o sobre un tramo de `export/aristas_red.geojson` / `export/nodos.geojson`.
2. Armar un `LineString` en el plano de `export/` (metros `col_urban`).
   - Extremo sobre un nodo: copiar las coordenadas de ese nodo en `export/nodos.geojson`. Así, al reproyectar, queda a 0 m y el enganche es exacto.
   - Extremo a mitad de un tramo: interpolar el punto sobre la geometría de esa arista en `export/aristas_red.geojson`. El grafo parte el tramo al cargar.
   - Si el trazo se hizo en WGS84 (lon, lat), transformarlo al `proj4` de arriba antes de guardarlo. No escribir lon/lat dentro de `export/pasillos.geojson`.
3. Calcular `longitud_m` como la suma de las distancias euclidianas entre vértices consecutivos, en ese plano. La unidad ya es el metro.
4. Añadir el feature a `export/pasillos.geojson`. `id_pasillo` debe ser único. No reemplazar los que ya están.
5. Reproyectar desde la raíz del repo:

```bash
python3 scripts/reproject_to_wgs84.py
```

6. Recargar la app por completo. El mapa vive en un WebView y un refresco rápido puede conservar el HTML anterior. La línea del atajo se dibuja en violeta, encima de los edificios.

No hace falta tocar `graph.ts` ni `CampusMap.tsx` si el extremo engancha con las tolerancias de 4 m y 12 m.

## Feature

```json
{
  "type": "Feature",
  "properties": {
    "id_pasillo": 3,
    "name": "Nombre corto del cruce",
    "edificio": "E20",
    "highway": "footway",
    "covered": "yes",
    "tunnel": "building_passage",
    "oneway": null,
    "longitud_m": 0
  },
  "geometry": {
    "type": "LineString",
    "coordinates": [[x1, y1], [x2, y2]]
  }
}
```

- `edificio`: código del edificio si el cruce va por dentro. `null` si es espacio abierto, como una plazoleta.
- `highway`: `"footway"` en un pasillo, `"pedestrian"` en un recorrido abierto.
- `covered` / `tunnel`: `"yes"` y `"building_passage"` solo si de verdad se cruza un edificio. En espacio abierto, `null`.
- `oneway`: `null` para los dos sentidos. `"yes"` solo si se camina en un sentido.
- La geometría es un `LineString`, no un `MultiLineString`. El primer y el último punto son los que se enganchan. Los vértices intermedios dibujan la curva y entran en `longitud_m`, pero no crean nodos propios.

## Comprobar que la ruta lo usa

Después de reproyectar, en `mobile/assets/geojson/pasillos.json` los extremos deben quedar a 4 m o menos de un nodo, o a 12 m o menos de una arista, en WGS84.

Una ruta que antes rodeaba el obstáculo debe bajar de metros y su geometría debe seguir la línea nueva. Si rodear sigue siendo más corto, el atajo está conectado y el cálculo no lo elige: eso es lo esperado.

Si la distancia no cambia y la geometría tampoco pasa por ahí, el extremo no enganchó. Acercar el punto al nodo o al tramo en `export/pasillos.geojson` y volver a correr el script.

## Los que ya están

| id | Nombre | Longitud | Enganche |
| --- | --- | --- | --- |
| 1 | Pasillo E20 | 66 m | Nodo del sendero que llega a la fachada este, y corte del sendero cubierto del sur |
| 2 | Cruce Plazoleta de Ingeniería | 96 m | Nodo del sendero en el Complejo de Auditorios y nodo del camino norte, junto a Ingeniería Mecánica |
| 3 | Conexión sur biblioteca | 130 m | Nodo del sendero en la esquina suroeste de la biblioteca (E19) y nodo del sendero este-oeste al este |
| 4 | Enlace nodo norte biblioteca | 16 m | Punto sobre el pasillo 3 y nodo del sendero que sube hacia la Circunvalar |
| 5 | Enlace camino peatonal biblioteca | 28 m | Punto sobre el pasillo 3 y extremo norte del camino peatonal que baja al sur |
| 6 | Extensión norte pasillo E20 | 81 m | Punto sobre el pasillo 3 y nodo norte del pasillo E20 |
| 7 | Enlace sendero lenguas | 12 m | Nodo del sendero al sur de la Escuela de Ciencias del Lenguaje y vértice de la vía de servicio que sube hacia ese sendero |
| 8 | Enlace camino sur lenguas | 26 m | Punto sobre la vía de servicio y nodo final del camino curvo del sur |
| 9 | Enlace peatonal oeste lenguas | 10 m | Nodo sur del peatonal oeste de lenguas y corte de la vía de servicio |
| 10 | Sendero B23 | 139 m | Nodo del camino peatonal del B13, en la esquina sureste del B23, y corte de la vía de servicio al oeste. La línea sigue recta el costado este y, en escuadra, el norte del edificio |
