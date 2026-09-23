# ForgeBoard website

The public site for the ForgeBoard board family: Spark, Sprint, Indus and Flint.

Built from the approved Claude Design file **`ForgeBoard v2.dc.html`**. That file
is a design-canvas document, not a website — it runs on the Claude Design runtime
and uses placeholder image slots. This folder is the real implementation: plain
HTML, CSS and JavaScript, no framework and no dependencies to install.

## Build

```
python3 tools/build.py
```

Ten pages are generated from the board dataset at the top of `build.py`, so the
product pages, the compare table and the docs index cannot drift apart. The
script writes **only** `.html` files and never touches `assets/`, `css/` or `js/`.

## Check

```
python3 tools/check.py
```

Confirms every page exists, every internal link, image, script and model
resolves on disk, and that no design-canvas markup survived into the output.

## Preview

```
python3 tools/serve.py
```

It prints a localhost URL and a phone URL for the same Wi-Fi. Use this rather
than `python3 -m http.server`: it gzips the models and scripts the way a real
host does (a 3.3 MB model becomes 1.0 MB on the wire), and it sends cache
headers so a rebuild is picked up on the next reload. Opening the files
directly will not work; relative assets and the `.glb` models need `http://`.

Every stylesheet, script and model URL carries a content hash (`?v=…`) added
by `build.py`, so browsers cache them for a year yet always fetch a changed
file. The vendored three.js is pinned to a version and needs no hash.

## Layout

```
build.py            page generator + all board data
check.py            structural checks
serve.py            dev server: gzip + cache headers
optimize_models.py  Blender export → web model
index.html          generated — do not hand-edit
boards/             generated: index + one page per board
compare/ software/ docs/ contact/     generated
css/site.css        hand-written
js/fb-board.js      <fb-board> element: 2D render, upgrades to WebGL
js/motion.js        reveals, header theme, nav, view switcher, form
js/vendor/          three.js r160, pinned
assets/boards/      board renders (WebP)
assets/photos/      IDE screenshot, lab photo + board close-up (WebP, 1x + 2x)
assets/models/      board models (.glb)
assets/video/       the pick-and-place clip (720p + a 540p phone encode) and its poster
```

## How the 3D works

Photos sit in fixed-ratio frames and are cropped to fill them. The IDE
screenshot is shown zoomed in, the way IDE vendors show theirs: anchored at
its top-left corner at 220% of the frame width, so the title bar, sidebar and
editor read at a usable size and the bottom-right runs off the frame. Its two
frames still take the screenshot's own proportions, computed at build time.

On a product page `<fb-board>` shows nothing but a centred "Loading 3D"
pill, counting up the download, until the model itself appears. The flat
WebP render is used only where 3D genuinely cannot happen: no WebGL, a
save-data or 2G/3G connection, or a failed load. Top and Bottom are renders
by design. On the home page, where the boards carry no model, the renders
are the content. Reduced-motion users get the model but it does not turn on
its own.

Once the model is up, the stage takes `touch-action: none`: a finger on the
board spins the board, and the page scrolls from anywhere else. While it is
still the flat render, vertical swipes scroll the page as normal.

## Models

The Blender exports are not served as-is. `optimize_models.py` bakes every
node transform into the vertices, merges everything that shares a material
(981 draw calls become 16), and quantizes positions to 16-bit and normals to
8-bit under `KHR_mesh_quantization`, which three.js reads natively. Pure
Python, no dependencies, about two seconds for all four.

```
python3 tools/optimize_models.py "~/Desktop/Forgeboard/Infographics/GLB files"
```

| board  | export | served | draw calls |
|--------|-------:|-------:|-----------:|
| Spark  | 4.5 MB | 2.5 MB | 871 → 18 |
| Sprint | 7.0 MB | 4.3 MB | 102 → 21 |
| Indus  | 5.9 MB | 3.3 MB | 985 → 16 |
| Flint  | 2.8 MB | 1.5 MB | 531 → 13 |

## Video

The wide frame in the Made in India section is a 16 s clip of the
pick-and-place line, next to the board close-up photo. It plays muted only
while it is on screen and pauses when scrolled away;
phones get the smaller encode. Reduced-motion and save-data visitors, slow
connections and JS-off all get a plain `<video controls>` with the poster
instead, so nobody is left with a frozen frame they cannot play.

Encoded from the phone original with ffmpeg (`brew install ffmpeg`); the
built-in `avconvert` has no bitrate control and produced 15 MB for the same clip.

```
ffmpeg -i in.mov -an -vf scale=1280:-2 -c:v libx264 -crf 28 -preset slow -profile:v high -level 4.0 -pix_fmt yuv420p -movflags +faststart -g 48 assets/video/line.mp4
ffmpeg -i in.mov -an -vf scale=960:-2  -c:v libx264 -crf 29 -preset slow -profile:v main -level 3.1 -pix_fmt yuv420p -movflags +faststart -g 48 assets/video/line-sm.mp4
```

| file        | size   |
|-------------|-------:|
| line.mp4    | 3.9 MB |
| line-sm.mp4 | 2.3 MB |

three.js is vendored in `js/vendor/` (v0.160.0) and named `three` in each
product page's import map, so the loader's bare import and the component's
import resolve to the same copy. Product pages preload the library and the
model before any script runs. Models load automatically on any device with
WebGL unless the connection reports save-data, 2G or 3G; the 3D button
forces a load regardless.

## Known gaps

- **The enquiry form has no backend.** It composes a `mailto:` to
  contact@defenceforgeindustries.com. Point it at a real endpoint before launch.
- **Download links are placeholders.** Every datasheet, pinout and schematic is
  marked "Soon" and links to the docs page.
- **No deploy path is set up.** Nothing here publishes the site.

## Verification notes

Headless Chrome on macOS will not lay out below roughly 485 CSS pixels, so a
`--window-size=390` screenshot is cropped, not narrow, and will show phantom
overflow. To check a true 390px viewport, load the site inside an iframe of that
exact width and screenshot the wrapper page instead.
