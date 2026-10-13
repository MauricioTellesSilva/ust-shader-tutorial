# Shader Tutorial

An independent copy of the Ultimate Studio Tool node-based shader editor, including an HTML tutorial, a 3D preview, and complete development guides in English.

## Quick start

From this project folder:

```powershell
npm ci
npm run dev
```

If you are starting at the repository root, run `cd shader_tutorial` first. The Desktop copy is self-contained: open a terminal in that folder and use the same commands. Dependencies and temporary browser profiles are not included in the Desktop copy; install dependencies with `npm ci` before running Vite.

Use Node.js 24 and npm 11 to reproduce the development environment. When using another Node version, check the dependency `engines` requirements.

Open the addresses printed by Vite:

- Free editor: `http://127.0.0.1:5180/`.
- HTML tutorial example: `http://127.0.0.1:5180/tutorial.html`.

The port is fixed (`--strictPort`). If it is already in use, stop the service using it or change the command in `package.json`.

**Do not double-click the source HTML.** It imports TypeScript/TSX, which Vite must transform. Serve the production build over HTTP too, rather than `file://`.

## What is included

- The original editor: node creation, sockets, SVG connections, dragging, zoom, selection, copy/paste, undo/redo, and diagnostics.
- The copied material engine: registration, evaluation, GLSL compilation, serialization, migration, Three.js materials, and relief support.
- A test sphere with fixed lighting, orbit controls, and material updates driven by the graph.
- A checker material tutorial with six steps evaluated from the actual graph state.
- Controls to reset, load the completed example, export JSON, and import JSON.
- Locally generated demo textures, with no image downloads.
- Unit, integration, and headless-browser tests.
- English pages, lesson instructions, controls, diagnostics, and development guides.

This folder does not import code from `../Frontend`, use project APIs, or require the original backend. It can be moved to another directory. Third-party dependencies are installed through npm. The original application is unchanged.

## Documentation

| Guide | Contents |
| --- | --- |
| [Modifying the editor](docs/editor.md) | Architecture, files, appearance, sockets, commands, custom nodes, GLSL, preview, persistence, and tests. |
| [Creating tutorials](docs/tutoriais.md) | Lesson contract, initial and completed graphs, step evaluation, HTML, registration, build, textures, and delivery checklist. |
| [Copy provenance](COPIA.md) | Source files and adaptations relative to the original frontend. |

The existing guide filenames are retained; all guide content and teaching examples are in English. Original source-code comments may remain in Portuguese to preserve their provenance.

## Structure

```text
shader_tutorial/
├── index.html                 free editor
├── tutorial.html              HTML lesson example
├── README.md
├── LICENSE
├── docs/
│   ├── editor.md
│   └── tutoriais.md
├── package.json
├── package-lock.json
├── vite.config.ts             HTML build entries
├── tsconfig.json
└── src/
    ├── main.tsx               reads data-tutorial and mounts React
    ├── TutorialApp.tsx        state, steps, and file actions
    ├── graphFiles.ts          validated graph import/export
    ├── tutorials/             lesson definitions and assets
    ├── components/nodes/      copied editor and commands
    ├── components/help/       preview and example textures
    ├── components/MaterialPreview.tsx
    ├── materials/nodes/       engine and node types
    ├── materials/             material dependencies
    ├── features/              LOD and wireframe support
    ├── workers/               geometry subdivision
    ├── i18n/                  English adapter and local UI catalog
    ├── styles/                page theme and editor CSS
    ├── constants/
    └── types/
```

## Validation and publishing

Run inside the project folder:

```powershell
npm run typecheck
npm test
npm run build
npm run preview
```

The build writes **only** this project's `dist/`; it does not replace the original application's build. It contains `index.html`, `tutorial.html`, and compiled assets. Publish the contents of `dist/` to a static HTTPS server. The `base: './'` setting supports deployment under a subdirectory if asset paths remain relative.

The Desktop copy includes a refreshed English build in `dist/`. Vite may warn about a chunk exceeding 500 kB because the editor and 3D engine are bundled together. This is not a build error; consider code splitting or lazy loading before deploying under stricter performance requirements.

Use `npm ci` in automated environments. Register additional lesson pages in `vite.config.ts`: merely creating an HTML file does not include it in the build.

### Reproducible browser test

After building, run `npm run test:browser`. It uses headless Edge, a temporary profile, and its own static server; it does not open your personal browser profile or access project data. It builds the material through editor actions and checks WebGL, solution/reset, export/import, invalid JSON rejection, English UI text, and the layout at 390 px. Results and screenshots are written to `.browser-validation/`, which Git ignores.

The default Windows executable is `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`. To use another installed Chromium executable, set `$env:SHADER_BROWSER_BIN = 'full/path/to/browser'`. The script requires Node.js 24 and an installed browser; it does not download one. Software rendering is enabled only in the isolated test process, without changing personal browser settings.

## Limits and safety

- Graph and progress are in memory. Reloading or closing the page discards changes that have not been exported.
- Reset, import, and loading the completed example replace the graph and clear selection, view, and undo history. Undo/redo applies only to the current session.
- JSON exports the graph, not images, meshes, view, progress, or GLSL code. Texture IDs resolve through the local catalog.
- Files larger than 1 MB, invalid JSON, and graphs with validation issues are rejected without replacing the current exercise.
- There is no texture upload, login, project management, remote save, HostLocal integration, image-processing pipeline, or arbitrary-URL resolution.
- The checker lesson needs no images. Image Texture examples use the bundled local assets.
- Without WebGL 2, the editor and step evaluation remain usable; a message replaces the sphere. Graph diagnostics do not replace checking GPU errors in the console.
- Three.js renders the material, not Blender. Similar node names do not guarantee exact visual equivalence.
- Node source code is trusted application code. Never interpret imported text as executable JavaScript or GLSL.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Blank page when opening HTML | Use `npm run dev`; browsers cannot execute raw TSX. |
| Port 5180 already in use | Free the port or change the development command. |
| Gray sphere | Connect `Principled BSDF.BSDF → Material Output.Surface` and check the color chain. |
| Missing input control | A connected input receives its value from the connection; disconnect it to edit the local value. |
| 3D preview unavailable | Enable hardware acceleration and WebGL 2; check the console and drivers. |
| Nodes outside the view | Select the nodes and press `F`, or use `Reset view` and adjust zoom. |
| Steps became pending again | Evaluation is continuous: changing parameters or undoing connections updates the steps. |
| Unknown tutorial | Check `data-tutorial` and its entry in `src/tutorials/index.ts`. |
| Lesson missing in production | Add its HTML build entry and rebuild. |
| npm certificate error | Fix the trust chain; on Node 24, try `NODE_OPTIONS=--use-system-ca`. Do not disable TLS verification. |

To apply the certificate option only to the current PowerShell process:

```powershell
$env:NODE_OPTIONS = '--use-system-ca'
npm ci
```

## License and maintenance

[MIT License](/LICENSE)
