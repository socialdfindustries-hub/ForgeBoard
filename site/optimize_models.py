#!/usr/bin/env python3
"""Shrink the board models for the web. Pure Python, no dependencies.

    python3 site/optimize_models.py "~/Desktop/Forgeboard/Infographics/GLB files"

Reads each Blender export and writes site/assets/models/<board>.glb, doing
three things the exporter does not:

1. Bakes every node transform into the vertices and merges all meshes that
   share a material. A board arrives as up to 981 separate meshes, which is
   981 draw calls a phone GPU has to issue every frame; it leaves as ~15.
2. Quantizes positions to 16-bit integers and normals to 8-bit, under the
   KHR_mesh_quantization extension that three.js reads natively. Halves the
   vertex data with no visible difference at any zoom the site offers.
3. Keeps indices 16-bit by splitting any merged group over 65,535 vertices.

The models have no textures, so nothing else needs carrying across.
"""

from __future__ import annotations

import json
import math
import pathlib
import struct
import sys
from array import array

OUT_DIR = pathlib.Path(__file__).resolve().parent / "assets" / "models"

SOURCES = {
    "spark": "Spark_PCB_final.glb",
    "sprint": "Sprint_PCB_final.glb",
    "indus": "Indus_PCB_final.glb",
    "flint": "Flint_PCB_final.glb",
}

JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942
CT_BYTE, CT_UBYTE, CT_SHORT, CT_USHORT, CT_UINT, CT_FLOAT = 5120, 5121, 5122, 5123, 5125, 5126
CT_SIZE = {CT_BYTE: 1, CT_UBYTE: 1, CT_SHORT: 2, CT_USHORT: 2, CT_UINT: 4, CT_FLOAT: 4}
CT_FMT = {CT_BYTE: "b", CT_UBYTE: "B", CT_SHORT: "h", CT_USHORT: "H", CT_UINT: "I", CT_FLOAT: "f"}
TYPE_N = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
MAX_U16 = 65535


# ----------------------------------------------------------------------------
# reading
# ----------------------------------------------------------------------------

def read_glb(path: pathlib.Path) -> tuple[dict, bytes]:
    data = path.read_bytes()
    if data[:4] != b"glTF":
        raise ValueError(f"{path.name}: not a GLB")
    off, js, bin_ = 12, None, b""
    while off < len(data):
        ln, ty = struct.unpack_from("<II", data, off)
        off += 8
        if ty == JSON_CHUNK:
            js = json.loads(data[off:off + ln])
        elif ty == BIN_CHUNK:
            bin_ = data[off:off + ln]
        off += ln
    if js is None:
        raise ValueError(f"{path.name}: no JSON chunk")
    return js, bin_


def read_accessor(js: dict, bin_: bytes, idx: int) -> list:
    """Return the accessor's elements as a flat Python list."""
    acc = js["accessors"][idx]
    bv = js["bufferViews"][acc["bufferView"]]
    n = TYPE_N[acc["type"]]
    ct = acc["componentType"]
    size = CT_SIZE[ct]
    count = acc["count"]
    base = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    stride = bv.get("byteStride", 0) or n * size
    fmt = "<" + CT_FMT[ct] * n
    out = []
    if stride == n * size:
        # tightly packed: one unpack of the whole run
        out = list(struct.unpack_from("<" + CT_FMT[ct] * (n * count), bin_, base))
    else:
        for i in range(count):
            out.extend(struct.unpack_from(fmt, bin_, base + i * stride))
    return out


# ----------------------------------------------------------------------------
# transforms
# ----------------------------------------------------------------------------

def mat_identity() -> list[float]:
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]   # column-major


def mat_mul(a: list[float], b: list[float]) -> list[float]:
    """a × b, both column-major 4×4."""
    out = [0.0] * 16
    for c in range(4):
        for r in range(4):
            out[c * 4 + r] = sum(a[k * 4 + r] * b[c * 4 + k] for k in range(4))
    return out


def node_local_matrix(node: dict) -> list[float]:
    if "matrix" in node:
        return list(node["matrix"])
    t = node.get("translation", [0, 0, 0])
    q = node.get("rotation", [0, 0, 0, 1])
    s = node.get("scale", [1, 1, 1])
    x, y, z, w = q
    # rotation matrix from quaternion (column-major)
    r = [
        1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
        2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
        2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
        0, 0, 0, 1,
    ]
    for c in range(3):
        for rr in range(3):
            r[c * 4 + rr] *= s[c]
    r[12], r[13], r[14] = t
    return r


def normal_matrix(m: list[float]) -> list[float]:
    """Inverse-transpose of the upper 3×3, as a row-major 3×3."""
    a, b, c = m[0], m[4], m[8]
    d, e, f = m[1], m[5], m[9]
    g, h, i = m[2], m[6], m[10]
    det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
    if abs(det) < 1e-12:
        return [1, 0, 0, 0, 1, 0, 0, 0, 1]
    inv = [
        (e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det,
        (f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det,
        (d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det,
    ]
    # transpose
    return [inv[0], inv[3], inv[6], inv[1], inv[4], inv[7], inv[2], inv[5], inv[8]]


def walk(js: dict, node_idx: int, parent: list[float], out: list) -> None:
    node = js["nodes"][node_idx]
    world = mat_mul(parent, node_local_matrix(node))
    if "mesh" in node:
        out.append((node["mesh"], world))
    for child in node.get("children", []):
        walk(js, child, world, out)


# ----------------------------------------------------------------------------
# merge + quantize
# ----------------------------------------------------------------------------

def optimize(src: pathlib.Path, dst: pathlib.Path) -> tuple[int, int, int, int]:
    js, bin_ = read_glb(src)
    scene = js["scenes"][js.get("scene", 0)]
    placed: list = []
    for root in scene["nodes"]:
        walk(js, root, mat_identity(), placed)

    # material index -> list of (positions, normals, indices) in world space
    groups: dict[int, list[tuple[list, list, list]]] = {}
    in_meshes = 0
    for mesh_idx, world in placed:
        mesh = js["meshes"][mesh_idx]
        nm = normal_matrix(world)
        for prim in mesh["primitives"]:
            if prim.get("mode", 4) != 4:
                continue   # only triangles
            attrs = prim["attributes"]
            pos = read_accessor(js, bin_, attrs["POSITION"])
            nrm = read_accessor(js, bin_, attrs["NORMAL"]) if "NORMAL" in attrs else None
            cnt = len(pos) // 3
            if "indices" in prim:
                ind = read_accessor(js, bin_, prim["indices"])
            else:
                ind = list(range(cnt))

            wp = [0.0] * (cnt * 3)
            wn = [0.0] * (cnt * 3)
            m = world
            for i in range(cnt):
                x, y, z = pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]
                wp[i * 3] = m[0] * x + m[4] * y + m[8] * z + m[12]
                wp[i * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]
                wp[i * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14]
                if nrm:
                    nx, ny, nz = nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]
                    tx = nm[0] * nx + nm[1] * ny + nm[2] * nz
                    ty = nm[3] * nx + nm[4] * ny + nm[5] * nz
                    tz = nm[6] * nx + nm[7] * ny + nm[8] * nz
                    ln = math.sqrt(tx * tx + ty * ty + tz * tz) or 1.0
                    wn[i * 3], wn[i * 3 + 1], wn[i * 3 + 2] = tx / ln, ty / ln, tz / ln
                else:
                    wn[i * 3 + 1] = 1.0
            groups.setdefault(prim.get("material", -1), []).append((wp, wn, ind))
            in_meshes += 1

    # global bounds for one quantization frame
    lo = [math.inf] * 3
    hi = [-math.inf] * 3
    for parts in groups.values():
        for wp, _, _ in parts:
            for i in range(0, len(wp), 3):
                for k in range(3):
                    v = wp[i + k]
                    if v < lo[k]: lo[k] = v
                    if v > hi[k]: hi[k] = v
    center = [(lo[k] + hi[k]) / 2 for k in range(3)]
    extent = max(hi[k] - lo[k] for k in range(3)) or 1.0
    scale = extent / 2 / 32767.0          # world units per quantized step

    # build merged primitives, each ≤ 65,535 vertices so indices stay 16-bit
    out_bin = bytearray()
    buffer_views: list[dict] = []
    accessors: list[dict] = []
    primitives: list[dict] = []
    out_verts = 0

    def add_view(data: bytes, stride: int | None, target: int) -> int:
        while len(out_bin) % 4:
            out_bin.append(0)
        bv = {"buffer": 0, "byteOffset": len(out_bin), "byteLength": len(data), "target": target}
        if stride:
            bv["byteStride"] = stride
        out_bin.extend(data)
        buffer_views.append(bv)
        return len(buffer_views) - 1

    def emit(material: int, pos_q: array, nrm_q: array, ind: array, qmin: list, qmax: list) -> None:
        nonlocal out_verts
        n = len(pos_q) // 4
        out_verts += n
        pv = add_view(pos_q.tobytes(), 8, 34962)
        nv = add_view(nrm_q.tobytes(), 4, 34962)
        iv = add_view(ind.tobytes(), None, 34963)
        ict = CT_UINT if ind.typecode == "I" else CT_USHORT
        accessors.append({"bufferView": pv, "componentType": CT_SHORT, "count": n, "type": "VEC3",
                          "min": qmin, "max": qmax})
        accessors.append({"bufferView": nv, "componentType": CT_BYTE, "normalized": True, "count": n, "type": "VEC3"})
        accessors.append({"bufferView": iv, "componentType": ict, "count": len(ind), "type": "SCALAR"})
        prim = {"attributes": {"POSITION": len(accessors) - 3, "NORMAL": len(accessors) - 2},
                "indices": len(accessors) - 1, "mode": 4}
        if material >= 0:
            prim["material"] = material
        primitives.append(prim)

    for material, parts in groups.items():
        pos_q = array("h")
        nrm_q = array("b")
        ind_q = array("H")
        qmin = [32767] * 3
        qmax = [-32768] * 3
        base = 0

        def flush() -> None:
            nonlocal pos_q, nrm_q, ind_q, qmin, qmax, base
            if len(ind_q):
                emit(material, pos_q, nrm_q, ind_q, list(qmin), list(qmax))
            pos_q, nrm_q, ind_q = array("h"), array("b"), array("H")
            qmin, qmax, base = [32767] * 3, [-32768] * 3, 0

        def pack(wp: list, wn: list, ind: list, pos_q: array, nrm_q: array, ind_q: array,
                 qmin: list, qmax: list, base: int) -> None:
            cnt = len(wp) // 3
            for i in range(cnt):
                for k in range(3):
                    q = int(round((wp[i * 3 + k] - center[k]) / scale))
                    q = max(-32767, min(32767, q))
                    pos_q.append(q)
                    if q < qmin[k]: qmin[k] = q
                    if q > qmax[k]: qmax[k] = q
                pos_q.append(0)
                for k in range(3):
                    nrm_q.append(max(-127, min(127, int(round(wn[i * 3 + k] * 127)))))
                nrm_q.append(0)
            for t in ind:
                ind_q.append(base + t)

        for wp, wn, ind in parts:
            cnt = len(wp) // 3
            if cnt > MAX_U16:
                # too many vertices for 16-bit indices: this part goes out on its own, 32-bit
                flush()
                p32, n32, i32 = array("h"), array("b"), array("I")
                mn, mx = [32767] * 3, [-32768] * 3
                pack(wp, wn, ind, p32, n32, i32, mn, mx, 0)
                emit(material, p32, n32, i32, mn, mx)
                continue
            if base + cnt > MAX_U16:
                flush()
            for i in range(cnt):
                for k in range(3):
                    q = int(round((wp[i * 3 + k] - center[k]) / scale))
                    q = max(-32767, min(32767, q))
                    pos_q.append(q)
                    if q < qmin[k]: qmin[k] = q
                    if q > qmax[k]: qmax[k] = q
                pos_q.append(0)                              # pad to 8 bytes
                for k in range(3):
                    nrm_q.append(max(-127, min(127, int(round(wn[i * 3 + k] * 127)))))
                nrm_q.append(0)                              # pad to 4 bytes
            for t in ind:
                ind_q.append(base + t)
            base += cnt
        flush()

    out_js = {
        "asset": {"version": "2.0", "generator": "ForgeBoard optimize_models.py"},
        "extensionsUsed": sorted(set(js.get("extensionsUsed", [])) | {"KHR_mesh_quantization"}),
        "extensionsRequired": ["KHR_mesh_quantization"],
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"name": src.stem, "mesh": 0, "translation": center, "scale": [scale] * 3}],
        "meshes": [{"name": src.stem, "primitives": primitives}],
        "materials": js.get("materials", []),
        "accessors": accessors,
        "bufferViews": buffer_views,
        "buffers": [{"byteLength": len(out_bin)}],
    }
    while len(out_bin) % 4:
        out_bin.append(0)

    js_bytes = json.dumps(out_js, separators=(",", ":")).encode("utf-8")
    while len(js_bytes) % 4:
        js_bytes += b" "
    total = 12 + 8 + len(js_bytes) + 8 + len(out_bin)
    with dst.open("wb") as f:
        f.write(b"glTF" + struct.pack("<II", 2, total))
        f.write(struct.pack("<II", len(js_bytes), JSON_CHUNK) + js_bytes)
        f.write(struct.pack("<II", len(out_bin), BIN_CHUNK) + bytes(out_bin))

    return in_meshes, len(primitives), out_verts, total


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__)
        return 2
    src_dir = pathlib.Path(argv[1]).expanduser()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for board, fn in SOURCES.items():
        src = src_dir / fn
        if not src.exists():
            print(f"  {board:7s} MISSING {src}")
            continue
        dst = OUT_DIR / f"{board}.glb"
        before = src.stat().st_size
        meshes, prims, verts, after = optimize(src, dst)
        print(f"  {board:7s} {before/1e6:4.1f} MB → {after/1e6:4.1f} MB   "
              f"{meshes:4d} meshes → {prims:3d} draw calls   {verts:,} verts")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
