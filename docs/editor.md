# How to modify the shader editor

All paths in this guide are relative to the standalone project folder. Make changes in this copy; none of these steps require editing the original frontend.

## 1. Architecture and responsibilities

```text
HTML → main.tsx → TutorialApp
                     ├── NodePracticeContext → NodeEditor → MaterialGraph
                     ├── lesson definition → evaluate(graph) → progress
                     └── MaterialPreview → applyGraph → Three.js/WebGL
```

The editor changes **graph data**, not user-authored GLSL. The node registry describes the controls and sockets to render. The engine reads the graph, resolves values, compiles procedural chains, and applies the result to the material.

| Area | Main file | Change it to modify |
| --- | --- | --- |
| HTML mounting | `src/main.tsx` | Lesson selection through `data-tutorial`. |
| Exercise state/actions | `src/TutorialApp.tsx` | Reset, solution, import/export, layout, and steps. |
| Visual editor | `src/components/nodes/NodeEditor.tsx` | Menus, gestures, selection, zoom, and command integration. |
| Node box | `src/components/nodes/NodeBox.tsx` | Controls, headers, sockets, and properties. |
| Texture picker | `src/components/nodes/TexturePicker.tsx` | Local catalog and thumbnails. |
| Context contract | `src/components/nodes/NodePracticeContext.ts` | State shared with the editor. |
| Editor geometry | `src/components/nodes/layout.ts` | Widths, heights, spacing, and socket colors. |
| Graph transformations | `src/components/nodes/commands.ts` | Delete, move, duplicate, copy, and paste. |
| Undo history | `src/components/nodes/history.ts` | Snapshot policy and history limits. |
| Keyboard shortcuts | `src/components/nodes/shortcuts.ts` and `useNodeShortcuts.ts` | Keys, commands, and focus rules. |
| Warnings | `src/components/nodes/graphDiagnostics.ts` | Checks displayed by the editor. |
| Page/theme | `src/styles/tutorial.css` | Global colors, spacing, grid, and responsiveness. |
| Editor CSS | `src/styles/nodes.css` | `.ne-*` elements. |
| Node engine | `src/materials/nodes/` | Types, validation, evaluation, and shader generation. |
| Sphere material | `src/components/MaterialPreview.tsx` | Mesh, material, textures, and GPU resources. |
| Canvas/camera | `src/components/help/PracticePreview.tsx` | Lights, framing, and the WebGL fallback. |

### Differences from the original

`NodeEditor` receives its state exclusively from the practice context, without reading `useAppStore`, permissions, or project materials. `NodeBox` does not read the active project material. The picker lists local assets only and does not upload files.

The editor, material engine, commands, undo history, and base styles were copied. LOD, UDIM, wireframe, and subdivision dependencies are included to keep the engine self-contained, but project infrastructure and file-processing services are not.

All tutorial UI is English. `src/i18n/index.ts` provides the local adapter; `englishUi.ts` contains only the relevant English entries extracted from the original frontend catalog. Copied sources may retain Portuguese lookup keys and comments. `tr` translates application-authored messages; `translateLabel` handles registered labels. Never pass user-authored content through these lookups. Direct page/exercise messages are written in English. See `COPIA.md` for provenance.

## 2. Keep graph, selection, and view separate

The context requires:

```ts
interface NodePracticeState {
    graph: MaterialGraph;
    setGraph: (graph: MaterialGraph) => void;
    assets: { id: string; name: string; preview: string }[];
    selection: string[];
    setSelection: (selection: string[]) => void;
    view: EditorView;
    setView: (view: EditorView) => void;
    showError: (message: string) => void;
}
```

Mount `NodeEditor` inside `NodePracticeContext.Provider`. Without it, this copy throws an explanatory error. Create separate state for each exercise; do not share the same graph object between lessons or learners.

- **Graph:** nodes, connections, and version; this is the exportable material.
- **Selection:** selected node IDs, not part of the material file.
- **View:** editor position and zoom, which affect neither the material nor lesson completion.
- **History:** editor-local snapshots, not exported.
- **Progress:** derived by evaluating the current graph against the lesson definition.

Update existing graphs immutably. Do not mutate objects already used by React or the history:

```ts
setGraph({
    ...graph,
    nodes: graph.nodes.map(node => node.id === selectedId
        ? { ...node, inputs: { ...node.inputs, roughness: 0.65 } }
        : node),
});
```

External changes do not automatically enter the editor's undo history. To replace an entire exercise, follow `replaceGraph` in `TutorialApp`: replace the graph, clear selection/view, and increment `version`, which is the editor's React `key`. For a new undoable command, integrate it into the editor command flow rather than merely calling `setGraph` externally.

## 3. Change appearance and layout

### Theme

Edit the variables in `src/styles/tutorial.css`:

```css
:root {
    --bg: #101518;
    --surface: #192126;
    --surface-2: #212c32;
    --text: #edf3f1;
    --text-muted: #b1c0c0;
    --border: #344248;
    --accent: #86dfb9;
    --accent-contrast: #09271c;
}
```

The editor also uses `--text-dim`, `--border-strong`, and `--panel-shadow`. Preserve text contrast, visible keyboard focus, and distinct socket colors. Fonts are local/system fonts; no external font service is required.

### Node and connection measurements

`layout.ts` computes SVG curve endpoints. Relevant constants:

- `NODE_WIDTH = 200`.
- `NODE_HEADER = 28`.
- `SOCKET_SPACING = 26`.
- `PROPERTY_ROW = 30`.
- `IMAGE_PROPERTY_HEIGHT = 188`.

When changing a visual dimension, update **both** `socketPosition` and the corresponding styles. Changing CSS padding, height, or width alone can misalign curves and sockets. Account for input rows, options, and the image picker before output rows.

`SOCKET_COLORS` controls sockets and connections. Headers use `NODE_CLASS_COLORS` and `nodeClass`. Categories organize the menu; classes organize visual identity.

### Exercise layout

`material-workspace` uses two columns on wide screens and stacks editor/preview below 1100 px. The editor needs an explicit height for its transformed canvas. On mobile, a smaller initial zoom makes the graph fit; do not arbitrarily scale node CSS.

Keep the toolbar, diagnostics, and steps visible. Test keyboard use and horizontal overflow on narrow screens.

## 4. Nodes, sockets, and connections

`src/materials/nodes/index.ts` registers definitions from `Input`, `Math`, `Color`, `Texture`, `Vector`, and `Shader`.

Use the registry and validation APIs:

```ts
import { connect, createNode, nextConnectionId, NODE_VALUE } from './src/materials/nodes';

const value = createNode(NODE_VALUE, { x: 40, y: 80 });
if (!value) throw new Error('Node type is not registered.');
let next = { ...graph, nodes: [...graph.nodes, value] };
next = connect(next, {
    sourceNode: value.id,
    sourceSocket: 'value',
    targetNode: shader.id,
    targetSocket: 'roughness',
}, nextConnectionId());
```

Adjust snippet imports to the file's actual directory. Use `getNodeDefinition(type)` to inspect socket IDs; visual labels are not necessarily identifiers. For example, `Base Color` has ID `baseColor`.

Existing socket types are `FLOAT`, `COLOR`, `NORMAL`, `BSDF`, and `DISPLACEMENT`. `typesCompatible` defines permitted conversions. `checkConnection` rejects missing nodes/sockets, incompatible types, and cycles. `connect` replaces the previous connection to the same input. For an invalid request it returns the unchanged graph; call `checkConnection` first when you need an explanatory message.

Adding a **new socket type** is more than adding a color: revise `SocketType`, validation, serialized values, `NodeBox` controls, evaluation, and compilation together. This changes the data contract, not just the theme.

Existing interactions: drag headers to move nodes, drag the background to pan, use the wheel to zoom, and click a curve to remove a connection. Sockets are buttons and support keyboard-initiated linking. A connected input hides its local control because the value comes from another node.

## 5. Add a custom node type

Example numeric node, saved as `src/materials/nodes/Math/TutorialDouble.ts`:

```ts
import type { NodeDefinition } from '../core/types';

export const tutorialDouble: NodeDefinition = {
    type: 'tutorialDouble',
    label: 'Double',
    category: 'math',
    inputs: [
        { id: 'value', label: 'Value', type: 'FLOAT', defaultValue: 0.25, min: 0, max: 1, step: 0.01 },
    ],
    outputs: [{ id: 'value', label: 'Value', type: 'FLOAT' }],
    evaluate: context => ({ value: { number: context.float('value') * 2 } }),
    emit: context => ({ value: context.temp('float', context.input('value') + ' * 2.0') }),
};
```

Import `tutorialDouble` in `src/materials/nodes/index.ts` and register it using `registerNodes([tutorialDouble])` after the existing registrations. The menu derives from the registry; you do not need a dedicated React box for this node.

Rules:

1. Choose a unique, stable `type`; JSON persists it.
2. Keep input/output IDs stable; changing one breaks existing connections.
3. Use `evaluate` for CPU values and `emit` for the GPU-chain expression. Constant nodes can implement both without being procedural.
4. Position/pixel-based patterns such as Checker Texture use `gpu: true` and generated GLSL. Study the Checker implementation before creating a pattern.
5. Enumerated properties use `options`; read them through `context.option`, which returns registered choices only.
6. Use `context.input`, `context.temp`, and `context.helper` when emitting GLSL. Never inject file/import text into shader source.
7. Test defaults, channel connections, JSON round-trips, uniform changes, and type errors.

For larger expressions, follow the `Name.ts` + `NameShader.ts` pattern. When removing node types or sockets, plan migrations in `core/migrate.ts`; do not change document versions without defining how older graphs are read.

## 6. Commands, shortcuts, and history

`commands.ts` implements pure transformations. `NodeEditor` integrates them with gestures and undo/redo. `history.ts` limits the stack to `LIMIT = 50` prior states.

| Shortcut | Behavior |
| --- | --- |
| `Shift+A` | Open the creation menu at the cursor. |
| `Shift+D` | Duplicate selection and move the copies; click confirms and `Esc` cancels. |
| `Ctrl+C` / `Ctrl+V` | Copy/paste nodes at the cursor. |
| `Ctrl+X` | Cut eligible selected nodes. |
| `Delete` | Delete eligible selected nodes. |
| `Ctrl+A` | Select all nodes. |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo/redo. |
| `F` | Frame selection, or the graph if nothing is selected. |
| `Esc` | Cancel the current gesture/menu. |

Material Output is protected against cutting/deletion, and the editor controls duplicate outputs. To change this rule, revise command behavior, creation, and tests together.

To add a shortcut, update `CommandId`, `matchShortcut`, `mutates`, `SHORTCUT_HELP`, and the executor in `NodeEditor`. The keyboard hook handles editor events or an unfocused cursor over the editor and ignores text-field editing. Preserve that guard so shortcuts do not intercept typing, text selection, or copy/paste in forms.

Do not save a snapshot for every pixel of a drag. The existing flow records the prior state and commits the action; cancellation restores the graph without inventing a history step.

## 7. Preview and rendering engine

`MaterialPreview.tsx` creates `SphereGeometry(1.2, 64, 48)` and a `MeshStandardMaterial`. Its effect calls `applyGraph`, resolves local texture IDs, and synchronizes relief. `PracticePreview.tsx` configures Canvas, camera, ambient/directional lights, and fallback behavior.

- **Geometry:** replace the geometry in `MaterialPreview` and adjust framing if needed.
- **Lighting:** edit `PracticePreview` while preserving stable conditions for comparison.
- **Assets:** the picker selects a reference; `MaterialPreview` resolves the actual texture. Both must agree on IDs.
- **Color/data:** the resolver keeps sRGB and non-color versions per ID. Normal, roughness, metallic, and height maps are not sRGB albedo.
- **Relief:** `syncReliefScene` handles displacement/subdivision. Bump shading is not a silhouette change. Subdivision increases CPU, memory, and GPU costs; test limits and the worker.
- **Lifecycle:** dispose materials, geometries, textures, and workers on unmount. Preserve `disposeReliefForObject` and the logic preventing double disposal of bound textures.

The core separates `evaluateGraph`, `compileGraph`, uniforms, structural keys, and program installation. Numeric edits should update uniforms without recompiling everything; structural changes can require a new program. Do not recreate Canvas or the material on every keystroke.

The fallback keeps the editor usable without WebGL 2. GPU compilation failures still require checking the console and real preview; jsdom does not compile shaders.

## 8. Import, export, and persistence

`graphJson` uses `serializeGraph`. `parseGraphJson` calls `deserializeGraph` and rejects every issue. The persisted format has `graphVersion`, `nodes`, and `connections`; connection fields are `sourceNodeId/sourceSocketId/targetNodeId/targetSocketId`. In memory, the fields are `sourceNode/sourceSocket/targetNode/targetSocket`.

Do not serialize `THREE.Material`, React, DOM, functions, GPU maps, or UI state. Assets are local IDs; JSON neither carries images nor grants access to paths/URLs.

To add autosave, define a dedicated key per lesson, document versioning, validated loading, and clear behavior when storage is unavailable. Do not use the original application's keys. Autosave is not implemented in this copy; users save explicitly by exporting.

## 9. Validation workflow

```powershell
npm run typecheck
npm test
npm run build
npm run preview
```

Test the changed unit first, then integration. `commands.test.ts`, `history.test.ts`, and `shortcuts.test.ts` were copied from the original pure tests. `TutorialApp.test.tsx`, `graphFiles.test.ts`, and `tutorials/checker.test.ts` cover the standalone adaptation; i18n tests check English messages.

After building, `npm run test:browser` runs the real Edge/Chromium smoke test. See README for `SHADER_BROWSER_BIN`, profile isolation, and screenshots. `npm test` alone does not validate WebGL.

Manual checklist: add nodes; move/zoom; connect/disconnect sockets; edit numbers/colors; copy/paste; cancel duplication; undo/redo; reset; reject invalid imports without losing the graph; export/reimport; test keyboard use; check mobile; verify rendering and English labels in the browser.

## 10. Synchronize with the original sources

1. Compare only the sources listed in `COPIA.md`.
2. Preserve `NodeEditor`'s context adaptation and `NodeBox`'s removal of the project store.
3. Do not overwrite the local picker, English adapter, or `TutorialApp` with project integrations.
4. Include new dependencies, including workers referenced by `new URL(..., import.meta.url)` rather than ordinary imports.
5. Check Three.js/React versions and GLSL chunk changes.
6. Add English messages for any new source lookup keys and translate new directly rendered labels.
7. Run tests, build, and real browser checks before distributing the updated copy.

This copy is for teaching and experimentation. Improvements intended for the main product need a separate frontend change reviewed with that product's tests.
