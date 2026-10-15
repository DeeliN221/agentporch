# Bundled PlantUML browser runtime

These resources are shipped with agentporch and loaded only when rendering PlantUML.
Users do not download an engine from a CDN, install Java, or configure a server.
Vite copies this directory to `dist`; the npm package includes it unchanged.

## Provenance and licensing

- PlantUML engine: `1.2026.9beta4`, source commit
  [`57a3d28484b643d4fd92ed788da983ac29d8866b`](https://github.com/plantuml/plantuml/tree/57a3d28484b643d4fd92ed788da983ac29d8866b).
  Distributed under GPL-3.0; see `PLANTUML-LICENSE.txt`.
- Browser artifacts: [`js-plantuml` at published commit
  `b0c5e6c978457b5e8e31c07565b63778bc4733c5`](https://github.com/plantuml/plantuml/tree/b0c5e6c978457b5e8e31c07565b63778bc4733c5/js-plantuml).
- Viz.js 3.24.0, copyright Michael Daines (MIT), includes Graphviz 14.1.1
  (EPL-1.0) and Expat 2.7.3 (MIT). See `VIZ-LICENSE.txt`,
  `GRAPHVIZ-LICENSE.txt`, and `EXPAT-LICENSE.txt`.
- C4-PlantUML (MIT): `C4-LICENSE.txt`; Open Iconic icons (MIT):
  `OPENICONIC-LICENSE.txt`; Twemoji graphics by Twitter and contributors
  (CC-BY-4.0): `EMOJI-LICENSE.txt`.
- Theme and library source notices are preserved in their generated resources.

`provenance.json` records the exact bundled artifact hashes. Upstream generated
resources are not hand-edited. The `frame.html` and `bridge.js` files are agentporch
integration code, covered by the repository license.

## Maintainer updates

This is a maintainer task, never an installation or startup step:

1. Select a reviewed upstream browser build and copy `plantuml.js`,
   `viz-global.js`, `themes.js`, `openiconic.js`, `emoji.js`, and `c4.min.js` from
   its immutable published revision into a new revision directory.
2. Convert the upstream ESM `plantuml.js` to a classic script using the
   esbuild version resolved by the repository's Vite dependency:

   ```js
   import fs from 'node:fs';
   import { createRequire } from 'node:module';
   const require = createRequire(import.meta.resolve('vite'));
   const { transform } = require('esbuild');
   const initial = await transform(fs.readFileSync('plantuml.js', 'utf8'), {
     format: 'iife', globalName: 'PlantUML', minify: true, target: 'es2020',
     banner: '/* PlantUML browser engine; generated from the pinned upstream ESM artifact. See NOTICE.md. */',
   });
   // Escape multiline strings without altering embedded resource data.
   const { code } = await transform(initial.code, {
     minify: true, target: 'es2020', supported: { 'template-literal': false },
     banner: '/* PlantUML browser engine; generated from the pinned upstream ESM artifact. See NOTICE.md. */',
   });
   fs.writeFileSync('plantuml-browser.js', code);
   ```

3. Remove the unneeded original ESM file. Carry over and review the integration
   bridge, update license notices and hashes, and change the renderer URL and
   package verification paths. A new directory prevents stale browser/PWA
   caches from mixing engine versions after an ordinary agentporch update.
4. Exercise real sequence, class, C4, Chinese-text, invalid-source, and concurrent
   diagrams in editor and chat. Verify cancellation, remote-resource blocking,
   and that a packed installation contains every runtime resource.

The isolated page allows only bundled scripts. Remote includes and local files
are intentionally unavailable. The bundled extension libraries are C4, themes,
Open Iconic, and emoji; other extension libraries fail with the original source
preserved instead of fetching unpinned remote code.
