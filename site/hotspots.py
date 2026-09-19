#!/usr/bin/env python3
"""Where the parts are — read straight out of the shipped models.

The board callouts need a 3D point each: where the USB-C port is, where the
module sits, which of the two buttons is which. None of that is typed in by
hand. `optimize_models.py` merges the geometry by material, and the material
names that survive the merge are the part names — `USB_Shell_Steel`,
`Module_Shield_Steel`, `Button_Cap_Black`, `LED_Lens_Orange`. One primitive
per material, so the vertices of a primitive are the vertices of that kind of
part, and their extent is where it is.

A material can cover several parts at once: `Button_Cap_Black` is both
buttons, `IC_Body_Black` is every black IC. Those come back as one primitive
whose bounding box spans the gap between them and whose centre is in empty
board. So the vertices are clustered first — grid-bucketed and flood-filled,
which for parts that sit millimetres apart and are separated by centimetres
needs no tolerance tuning — and each cluster is one physical part.

Pure Python, no dependencies. Run it directly to see what a board is made of:

    python3 site/hotspots.py site/assets/models/spark.glb
"""

from __future__ import annotations

import json
import pathlib
import struct
import sys

# glTF componentType -> (struct code, byte size)
_CT = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2),
       5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}

# Grid cell for clustering, in quantized position units. The models are
# quantized to 16 bits over the board's own extent, so this is scale-free:
# roughly 2 mm on a 50 mm board, which is wider than the gap inside any one
# component and far narrower than the gap between two of them.
_CELL = 2500


def _chunks(path: pathlib.Path) -> tuple[dict, bytes]:
    """The JSON and BIN chunks of a .glb."""
    b = path.read_bytes()
    if b[:4] != b"glTF":
        raise ValueError(f"{path} is not a .glb")
    off = 12
    clen, _ = struct.unpack_from("<II", b, off)
    js = json.loads(b[off + 8: off + 8 + clen].decode("utf-8"))
    off += 8 + clen + ((4 - clen % 4) % 4)
    blen, _ = struct.unpack_from("<II", b, off)
    return js, b[off + 8: off + 8 + blen]


def _read_vec3(js: dict, bin_: bytes, acc_i: int) -> list[tuple]:
    acc = js["accessors"][acc_i]
    bv = js["bufferViews"][acc["bufferView"]]
    code, size = _CT[acc["componentType"]]
    stride = bv.get("byteStride") or size * 3
    base = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    fmt = "<3" + code
    return [struct.unpack_from(fmt, bin_, base + i * stride)
            for i in range(acc["count"])]


def _clusters(pts: list[tuple], cell: int = _CELL) -> list[list[tuple]]:
    """Split a primitive's vertices into the separate parts they belong to.

    Buckets into a grid, then flood-fills through the 26 neighbours. Two
    components a few millimetres apart stay separate; one component's own
    vertices, always closer together than that, stay together.
    """
    grid: dict[tuple, list] = {}
    for p in pts:
        key = (p[0] // cell, p[1] // cell, p[2] // cell)
        grid.setdefault(key, []).append(p)

    seen: set = set()
    out: list[list[tuple]] = []
    for start in grid:
        if start in seen:
            continue
        seen.add(start)
        stack, group = [start], []
        while stack:
            cx, cy, cz = stack.pop()
            group += grid[(cx, cy, cz)]
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    for dz in (-1, 0, 1):
                        nb = (cx + dx, cy + dy, cz + dz)
                        if nb in grid and nb not in seen:
                            seen.add(nb)
                            stack.append(nb)
        out.append(group)
    return out


class Part:
    """One physical component, in the model's own coordinates (metres)."""

    __slots__ = ("material", "centre", "size", "axis")

    def __init__(self, material: str, centre: tuple, size: tuple, axis: int):
        self.material = material
        self.centre = centre      # (x, y, z) centre of its bounding box
        self.size = size          # (x, y, z) extent
        self.axis = axis          # index of the board's thickness axis

    @property
    def side(self) -> int:
        """+1 if the part is on the top face, -1 if on the underside."""
        return 1 if self.centre[self.axis] >= 0 else -1

    def anchor(self, lift: float = 0.0012) -> tuple:
        """The point the callout hangs off: on top of the part, not inside it."""
        c = list(self.centre)
        c[self.axis] += self.side * (self.size[self.axis] / 2 + lift)
        return tuple(c)

    def normal(self) -> tuple:
        n = [0.0, 0.0, 0.0]
        n[self.axis] = float(self.side)
        return tuple(n)

    def mm(self) -> tuple:
        return tuple(round(v * 1000, 1) for v in self.size)

    def __repr__(self) -> str:
        c = tuple(round(v * 1000, 1) for v in self.centre)
        return f"<Part {self.material} at {c}mm size {self.mm()}mm>"


def read(path: str | pathlib.Path, materials: set[str] | None = None) -> list[Part]:
    """Every part in a .glb, or only those of the named materials."""
    path = pathlib.Path(path)
    js, bin_ = _chunks(path)
    node = js["nodes"][0]
    scale = node.get("scale", [1, 1, 1])
    trans = node.get("translation", [0, 0, 0])
    names = [m.get("name", "") for m in js.get("materials", [])]

    def to_model(p):
        return tuple(p[i] * scale[i] + trans[i] for i in range(3))

    # The board's thickness axis, taken from the bare PCB: the shortest side
    # of a 35 x 1.5 x 50 mm slab is the one the components stand off.
    axis, prims = 1, js["meshes"][0]["primitives"]
    for prim in prims:
        if names[prim["material"]] != "PCB_Edge_FR4":
            continue
        pts = _read_vec3(js, bin_, prim["attributes"]["POSITION"])
        span = [max(p[i] for p in pts) - min(p[i] for p in pts) for i in range(3)]
        axis = span.index(min(span))
        break

    out: list[Part] = []
    for prim in prims:
        name = names[prim["material"]]
        if materials is not None and name not in materials:
            continue
        pts = _read_vec3(js, bin_, prim["attributes"]["POSITION"])
        made = []
        for group in _clusters(pts):
            lo = [min(p[i] for p in group) for i in range(3)]
            hi = [max(p[i] for p in group) for i in range(3)]
            c_lo, c_hi = to_model(lo), to_model(hi)
            centre = tuple((c_lo[i] + c_hi[i]) / 2 for i in range(3))
            size = tuple(abs(c_hi[i] - c_lo[i]) for i in range(3))
            made.append(Part(name, centre, size, axis))
        out += _merge(made)
    return out


def _merge(parts: list[Part], tol: float = 0.0012) -> list[Part]:
    """Join clusters that are the same part seen in pieces.

    A buzzer is modelled as a body and a separate lid floating 9 mm above it;
    nothing joins their vertices, so they cluster apart even though they are
    one component standing on one spot. Anything stacked over the same patch
    of board is therefore merged, and the merged part spans both - which is
    what puts the callout on top of the buzzer rather than inside it.

    Deliberately in-plane only: two parts side by side stay two parts.
    """
    if not parts:
        return []
    flat = [i for i in range(3) if i != parts[0].axis]
    boxes: list[list] = []          # [lo, hi] per merged part
    for p in parts:
        lo = [p.centre[i] - p.size[i] / 2 for i in range(3)]
        hi = [p.centre[i] + p.size[i] / 2 for i in range(3)]
        for box in boxes:
            blo, bhi = box
            bc = [(blo[i] + bhi[i]) / 2 for i in range(3)]
            if all(abs(p.centre[i] - bc[i]) < tol for i in flat):
                for i in range(3):
                    blo[i] = min(blo[i], lo[i])
                    bhi[i] = max(bhi[i], hi[i])
                break
        else:
            boxes.append([lo, hi])

    name, axis = parts[0].material, parts[0].axis
    return [Part(name,
                 tuple((lo[i] + hi[i]) / 2 for i in range(3)),
                 tuple(hi[i] - lo[i] for i in range(3)), axis)
            for lo, hi in boxes]


def _volume(p: Part) -> float:
    # Thickness is near zero on flat parts, so rank on footprint plus a
    # little height rather than a product that any zero would wipe out.
    a, b = [p.size[i] for i in range(3) if i != p.axis]
    return a * b + p.size[p.axis] * 1e-3


def at(parts: list[Part], x_mm: float, z_mm: float, size_mm: float = 6.0) -> Part:
    """A callout point that is not any one component.

    The pin headers are the case this exists for: every pad on the board
    shares one material, so there is no cluster that means "the header". The
    board's own thickness still comes from the model, so the point sits on
    the surface rather than at a guessed height.
    """
    board = [p for p in parts if p.material == "PCB_Edge_FR4"]
    axis = board[0].axis if board else 1
    top = max((p.centre[axis] + p.size[axis] / 2 for p in board), default=0.00075)
    c = [0.0, 0.0, 0.0]
    c[0], c[2] = x_mm / 1000, z_mm / 1000
    c[axis] = top
    return Part("(point)", tuple(c), (size_mm / 1000,) * 3, axis)


def pick(parts: list[Part], material: str, where: str | None = None) -> Part:
    """The one part of `material`, or the one `where` selects.

    `where` is "x>0", "z<0" and so on — how the callout table tells the two
    buttons apart, since the model knows there are two but not which is which.
    Silkscreen decides that; this only has to agree with it.
    """
    found = [p for p in parts if p.material == material]
    if not found:
        raise LookupError(f"no part with material {material!r}")
    if where is None:
        if len(found) > 1:
            raise LookupError(
                f"{material!r} is {len(found)} parts, so it needs a selector: "
                + ", ".join(f"x={p.centre[0]*1000:+.1f} z={p.centre[2]*1000:+.1f}"
                            for p in found))
        return found[0]

    if where == "big":
        # The body, not the pins or the lens sitting on it.
        return max(found, key=_volume)

    if where.startswith("end:"):
        # One end of a part rather than its middle. The antenna is why: it
        # shares a material with the module it is etched on, so the cluster
        # spans both and its centre lands on the module, a millimetre from
        # where the processor callout already points. Taking the far end
        # puts it on the antenna itself and keeps the position derived from
        # the model rather than typed in, so a re-export moves it.
        spec = where[4:]
        sign = -1 if spec[0] == "-" else 1
        key = {"x": 0, "y": 1, "z": 2}[spec[1]]
        big = max(found, key=_volume)
        c = list(big.centre)
        # Not the very edge: far enough out to clear whatever it overlaps,
        # far enough in that the callout still lands on solid geometry.
        c[key] += sign * (big.size[key] / 2) * 0.62
        return Part(big.material, tuple(c), big.size, big.axis)

    if where.startswith("near:"):
        # The one nearest a point on the board, in millimetres. For parts a
        # side test cannot separate: Sprint carries four black ICs, three of
        # them on the same side of the board, and only position says which is
        # the charger sitting between the charge port and the battery pads.
        wx, wz = (float(v) / 1000 for v in where[5:].split(","))
        return min(found, key=lambda q: (q.centre[0] - wx) ** 2
                                        + (q.centre[2] - wz) ** 2)

    key = {"x": 0, "y": 1, "z": 2}[where[0]]
    op = where[1]
    hit = [p for p in found
           if (p.centre[key] > 0 if op == ">" else p.centre[key] < 0)]
    if len(hit) != 1:
        raise LookupError(
            f"{material!r} with {where!r} matched {len(hit)} parts, wanted 1")
    return hit[0]


if __name__ == "__main__":
    for arg in sys.argv[1:] or sorted(
            str(p) for p in pathlib.Path("site/assets/models").glob("*.glb")):
        print(f"\n=== {arg} ===")
        found = read(arg)
        by_mat: dict[str, list[Part]] = {}
        for p in found:
            by_mat.setdefault(p.material, []).append(p)
        for mat in sorted(by_mat):
            group = by_mat[mat]
            print(f"  {mat:<26} {len(group)} part(s)")
            for p in sorted(group, key=lambda q: -q.centre[0]):
                c = [round(v * 1000, 1) for v in p.centre]
                face = "top" if p.side > 0 else "underside"
                print(f"      x={c[0]:+7.1f} y={c[1]:+6.1f} z={c[2]:+7.1f} mm"
                      f"   {p.mm()[0]:5.1f} x {p.mm()[2]:5.1f} mm   {face}")
