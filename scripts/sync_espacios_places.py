#!/usr/bin/env python3
"""Imprime el INSERT de fichas nuevas a partir de espacios.json.

No actualiza nombre ni descripción: on conflict do nothing.
Pegar el SQL en una migración, o ejecutarlo en Supabase.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "app" / "assets" / "geojson" / "espacios.json"
KINDS = {"bano", "parqueadero", "cancha"}


def sql_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def main() -> None:
    data = json.loads(SOURCE.read_text())
    rows = []
    seen = set()
    for feature in data.get("features") or []:
        props = feature.get("properties") or {}
        space_id = str(props.get("id") or "").strip()
        name = str(props.get("nombre") or "").strip()
        kind = props.get("tipo")
        if not space_id or not name or kind not in KINDS or space_id in seen:
            continue
        seen.add(space_id)
        rows.append(f"  ({sql_quote(space_id)}, {sql_quote(name)}, 'space')")

    if not rows:
        print("-- espacios.json no tiene fichas para sembrar")
        return

    print("-- Semilla desde app/assets/geojson/espacios.json")
    print("insert into public.places (id, name, kind)")
    print("values")
    print(",\n".join(rows))
    print("on conflict (id) do nothing;")


if __name__ == "__main__":
    main()
