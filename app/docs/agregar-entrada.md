# Agregar la entrada de un edificio

Una ruta hacia un edificio termina en su puerta, no en el nodo de QGIS más cercano al centro del polígono. Las puertas viven en una capa de puntos. La app corta el camino existente en el punto más cercano a esa puerta y usa ese corte como destino.

Si el edificio no tiene puerta en esta capa, la ruta sigue yendo al nodo más cercano al centro, como antes.

## Archivos

| Rol | Ruta |
| --- | --- |
| Fuente editable | `export/entradas.geojson` |
| Copia que lee la app | `mobile/assets/geojson/entradas.json` |
| Reproyección | `scripts/reproject_to_wgs84.py` |
| Corte del camino y destino | `mobile/src/routing/graph.ts` (`spliceEntrances`, `entrancePoint`) |

`mobile/assets/geojson/entradas.json` se genera. El script lo vuelve a escribir entero. Un reexport de nodos y aristas desde QGIS no borra las puertas.

## Sistema de coordenadas

`export/entradas.geojson` usa el mismo plano que el resto de `export/`: metros, proyección `col_urban`. Ver `docs/agregar-pasillo.md`. No escribir lon/lat dentro de ese archivo.

Una coordenada en WGS84 (`lat`, `lon`) hay que transformarla con el mismo `proj4` antes de guardarla. El orden del punto en el GeoJSON es `x, y` en metros, no `lat, lon`.

## Qué hace la app al cargar

1. Lee cada punto de `entradas.json`.
2. Busca el tramo de la red (caminos de QGIS y pasillos) más cercano.
3. Si está a 12 m o menos, parte ese tramo en el punto más cercano. Si la puerta no cae justo sobre el camino, agrega un tramo corto desde ese corte hasta la coordenada de la puerta. La ruta termina en la puerta aunque QGIS no tenga un nodo ahí.
4. Si está más lejos, esa puerta no entra al grafo y el edificio sigue usando el centro del polígono.
5. Al elegir ese edificio como origen o destino, el punto de la ruta es esa puerta. Si hay varias con el mismo `edificio`, se usa la que deja el recorrido más corto.

## Cómo agregar una

1. Pararte en la puerta, del lado del andén por donde se llega caminando.
2. Anotar latitud y longitud en WGS84.
3. Transformarlas al plano de `export/` y añadir un punto. `id_entrada` debe ser único. `edificio` es el código del edificio (`addr:housenumber`), por ejemplo `B13`.
4. Reproyectar desde la raíz del repo:

```bash
python3 scripts/reproject_to_wgs84.py
```

5. Recargar la app por completo.

En QGIS se puede digitalizar la misma capa de puntos con snapping activo sobre `aristas_red`, a vértices y a segmentos, y dejar el punto sobre el andén frente a la puerta. No hace falta cortar la arista ni crear un nodo en la red: el corte lo hace la app al cargar.

## Feature

```json
{
  "type": "Feature",
  "properties": {
    "id_entrada": 1,
    "edificio": "B13",
    "name": "Entrada B13"
  },
  "geometry": {
    "type": "Point",
    "coordinates": [1060879.257173, 865050.128169]
  }
}
```

## Las que ya están

| id | Edificio | Puerta |
| --- | --- | --- |
| 1 | B13 | Fachada norte, sobre el andén. WGS84: 3.375746, -76.529748 |
| 2 | E23 | Espíritu Santo Potes, lado norte. WGS84: 3.375818, -76.532795 |
| 3 | E26 | Álvaro Escobar Navia, lado sur. WGS84: 3.376490, -76.532663 |
