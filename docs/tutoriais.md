# How to create a tutorial with the editor

Paths are relative to this standalone project folder. The working example is `tutorial.html`, backed by `src/tutorials/checker.ts`.

## 1. The three parts of a lesson

1. **HTML:** title, introduction, prerequisites, explanations, navigation, and the mounting element.
2. **TypeScript definition:** identifier, steps, assets, initial graph, completed example, and evaluation.
3. **Shared editor:** `TutorialApp` mounts state, progress, editor, preview, and JSON actions. Usually it does not need changes for a new lesson.

The HTML chooses its definition:

```html
<div id="shader-tutorial" data-tutorial="checker"></div>
<script type="module" src="./src/main.tsx"></script>
```

Without `data-tutorial`, the same mounting element opens the free editor. An unregistered ID displays an error rather than silently opening a different lesson. Use exactly one `id="shader-tutorial"` per page.

All teaching content in this copy is English. Keep new HTML pages at `lang="en"`, write step instructions in English, and use the English editor controls when describing actions.

## 2. Plan the lesson before coding

Define:

- Audience and prerequisite knowledge: sockets, PBR, images, UVs, or GLSL as appropriate.
- An observable outcome, such as a checker pattern with a specified roughness.
- An initial graph that does not already complete the exercise.
- A minimal, valid completed example.
- One concrete action per step: create, connect, select an image, adjust a parameter, or check the output.
- Criteria observable in the graph, not clicks, elapsed time, node titles, or screenshot colors.
- Acceptable variation: node positions, zoom, color choices, action order, and similar details.
- Diagnostics and hints for expected mistakes.

The included checker lesson requires Checker Texture, a color connection, Scale 8, Roughness 0.65, a BSDF output connection, and no warnings. Checker colors are unrestricted; position, selection, and zoom do not affect completion.

## 3. Definition contract

`src/tutorials/types.ts` defines:

```ts
interface TutorialDefinition {
    id: string;
    title: string;
    objective: string;
    completion: string;
    assets: { id: string; name: string; preview: string }[];
    createInitialGraph: (compact: boolean) => MaterialGraph;
    createSolutionGraph: (compact: boolean) => MaterialGraph;
    steps: { id: string; title: string; instruction: string }[];
    evaluate: (graph: MaterialGraph) => boolean[];
}
```

| Field | Rule |
| --- | --- |
| `id` | Unique, stable, no spaces; also used in the exported JSON filename. |
| `title` / `objective` | Shown in the exercise panel; explain action and outcome. |
| `completion` | Displayed when all steps are true. |
| `assets` | Images authorized in this lesson's picker. |
| `createInitialGraph` | Return a new graph on every call, without shared objects. |
| `createSolutionGraph` | Return a complete example for the solution button and tests. |
| `steps` | Unique IDs, clear text, and the same order as evaluation. |
| `evaluate` | Pure function returning one boolean per step, without side effects. |

`compact` indicates a screen no wider than 800 px during creation/reset. Use it to arrange nodes for narrow screens. Resizing the window does not rewrite the learner's graph; CSS and view controls handle the rest.

Progress is **continuous**, not a saved checklist of clicks. Undoing a connection or changing a value can make a completed step pending again. The first pending step receives `aria-current="step"`, but actions may be performed in another order.

## 4. Create a complete new tutorial

This example teaches a matte green material without textures. Save it as `src/tutorials/solidColor.ts`:

```ts
import {
    connect, createNode, emptyGraph, nextConnectionId,
    NODE_MATERIAL_OUTPUT, NODE_PRINCIPLED,
    type ColorValue, type MaterialGraph,
} from '../materials/nodes';
import { graphDiagnostics } from '../components/nodes/graphDiagnostics';
import type { TutorialDefinition } from './types';

function initialGraph(compact: boolean): MaterialGraph {
    return {
        ...emptyGraph(),
        nodes: [
            createNode(NODE_PRINCIPLED, { x: 30, y: 40 })!,
            createNode(NODE_MATERIAL_OUTPUT, { x: compact ? 270 : 350, y: 40 })!,
        ],
    };
}

function solutionGraph(compact: boolean): MaterialGraph {
    const graph = initialGraph(compact);
    const shader = graph.nodes[0];
    const output = graph.nodes[1];
    shader.inputs = {
        ...shader.inputs,
        baseColor: { r: 0.2, g: 0.6, b: 0.3 },
        roughness: 0.7,
    };
    return connect(graph, {
        sourceNode: shader.id,
        sourceSocket: 'bsdf',
        targetNode: output.id,
        targetSocket: 'surface',
    }, nextConnectionId());
}

function progress(graph: MaterialGraph): boolean[] {
    const output = graph.nodes.find(node => node.type === NODE_MATERIAL_OUTPUT);
    const surface = graph.connections.find(connection =>
        connection.targetNode === output?.id && connection.targetSocket === 'surface');
    const shader = surface
        ? graph.nodes.find(node => node.id === surface.sourceNode && node.type === NODE_PRINCIPLED)
        : graph.nodes.find(node => node.type === NODE_PRINCIPLED);
    const color = shader?.inputs.baseColor as ColorValue | undefined;
    const local = (socket: string) => !graph.connections.some(connection =>
        connection.targetNode === shader?.id && connection.targetSocket === socket);
    return [
        !!shader && local('baseColor') && !!color && color.g > color.r && color.g > color.b,
        !!shader && local('roughness') && Number(shader.inputs.roughness) >= 0.7,
        !!shader && surface?.sourceSocket === 'bsdf',
        graphDiagnostics(graph, []).length === 0,
    ];
}

export const solidColorTutorial: TutorialDefinition = {
    id: 'solid-color',
    title: 'Matte green material',
    objective: 'Choose a green color, adjust roughness, and connect the material to the output.',
    completion: 'Your matte green material is ready.',
    assets: [],
    createInitialGraph: initialGraph,
    createSolutionGraph: solutionGraph,
    steps: [
        { id: 'green', title: 'Choose green', instruction: 'In Base Color, choose a color whose green channel is greater than its red and blue channels.' },
        { id: 'rough', title: 'Increase Roughness', instruction: 'Set Roughness to 0.7 or higher, leaving that socket unconnected.' },
        { id: 'surface', title: 'Connect BSDF', instruction: 'Connect BSDF on Principled to Surface on Material Output.' },
        { id: 'valid', title: 'Check warnings', instruction: 'Resolve the editor warnings.' },
    ],
    evaluate: progress,
};
```

Mutation in `solutionGraph` is limited to freshly created nodes, not objects already used by React or history. Use immutable copies when changing an existing graph.

### Register the definition

Add the import and key in `src/tutorials/index.ts`, preserving the existing lesson:

```ts
import { checkerTutorial } from './checker';
import { solidColorTutorial } from './solidColor';
import type { TutorialDefinition } from './types';

export const tutorials: Record<string, TutorialDefinition> = {
    checker: checkerTutorial,
    'solid-color': solidColorTutorial,
};
```

### Create the HTML

Copy `tutorial.html` to `solid-color.html` and change:

1. `<title>` and `meta description`.
2. Heading, introduction, estimated duration, and prerequisites.
3. The mounting element to `data-tutorial="solid-color"`.
4. The recipe and FAQs, removing Checker-specific instructions.
5. Navigation links and `aria-current` to reflect the current page.

A minimal new page:

```html
<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Matte green material</title>
</head>
<body>
    <main class="page-shell">
        <h1>Matte green material</h1>
        <p>Learn about base color, roughness, and the material output.</p>
        <div id="shader-tutorial" data-tutorial="solid-color"></div>
        <noscript>Enable JavaScript to complete the exercise.</noscript>
    </main>
    <script type="module" src="./src/main.tsx"></script>
</body>
</html>
```

The React entry imports the CSS. Source HTML still requires Vite; this is not a buildless editor that works directly through `file://`.

### Include the page in the build

Add it to `build.rolldownOptions.input` in `vite.config.ts`:

```ts
input: {
    editor: resolve(import.meta.dirname, 'index.html'),
    tutorial: resolve(import.meta.dirname, 'tutorial.html'),
    solidColor: resolve(import.meta.dirname, 'solid-color.html'),
},
```

`npm run dev` now serves the page, and `npm run build` includes `dist/solid-color.html`. Registering a definition alone does not automatically create an HTML route.

## 5. Design reliable evaluation criteria

### Follow the rendered chain

Trace Material Output's `Surface` input to its shader, then inspect that shader's inputs. A disconnected demonstration node must not complete a connection step. Do not inspect an arbitrary Principled when another one drives the output.

`checkerProgress` uses the shader connected to the output when available. Before that connection exists, it uses the first Principled to allow partial progress. It validates the Checker feeding that shader's `baseColor`.

### Stored local values are not connected-input values

`inputs.roughness` can remain stored after another node starts driving roughness. If the lesson requests direct field editing, check that the socket has no incoming connection. If it requests a chain, evaluate or inspect the node providing the value.

For exact numeric targets, use tolerance, such as `Math.abs(value - 8) < 0.01`. For visually selected colors, prefer relationships or ranges instead of exact decimal equality: hexadecimal pickers use quantized channels.

### Technical validity is not lesson completion

A warning-free graph can still fail to perform the requested task. Combine task-specific checks with `graphDiagnostics`. These diagnostics inspect connections and local references, not GPU compiler results.

Do not grade generated IDs, coordinates, array order, or zoom. Do not mutate the graph inside `evaluate`; React calls it to derive progress, not apply corrections.

## 6. Textures and PBR/relief lessons

Local examples are declared in `src/tutorials/assets.ts` and generated by `src/components/help/demoTextures.ts`:

| ID | Use |
| --- | --- |
| `demo-color` | Base color. |
| `demo-normal` | Normal through a Normal Map node. |
| `demo-roughness` | Roughness. |
| `demo-metallic` | Metallic. |
| `demo-height` | Bump or displacement. |

Include only required assets in `tutorial.assets`. The picker displays this list, but the preview only resolves IDs implemented by `MaterialPreview`. Adding a new picker entry does not automatically load its texture.

To add a texture:

1. Assign a stable ID and add its English name/thumbnail to the lesson catalog.
2. Bundle local bytes or implement procedural generation. For static files, use `public/textures/` and paths relative to `import.meta.env.BASE_URL`.
3. Implement loading/resolution in `MaterialPreview` and allow the new ID in its catalog check.
4. Keep the sRGB color version separate from non-color data.
5. For asynchronous loading, reapply the graph and invalidate the preview when ready. Show loading/errors without completing the task incorrectly.
6. Dispose resources and remove invalid references on unmount.
7. Test export/reimport and missing textures. JSON contains the ID, not pixels.

Do not accept arbitrary URLs, disk paths, or shader source from imported JSON. This copy does not include texture uploads, KTX2 conversion, or the original backend asset pipeline.

For **normal maps**, use a Non-Color image → Normal Map → Principled.Normal. For **bump**, use numeric height → Bump.Height → Principled.Normal. For **displacement**, use height → Displacement → Material Output.Displacement while keeping Surface connected. Geometry/subdivision affect silhouette; insufficiently subdivided meshes may not show the expected result.

## 7. Test the new lesson

Create `src/tutorials/solidColor.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { solidColorTutorial } from './solidColor';

describe('matte green material', () => {
    it('does not start with the task completed', () => {
        const graph = solidColorTutorial.createInitialGraph(false);
        expect(solidColorTutorial.evaluate(graph)).toEqual([false, false, false, false]);
    });
    it('the solution completes every step, including on mobile', () => {
        for (const compact of [false, true]) {
            const progress = solidColorTutorial.evaluate(solidColorTutorial.createSolutionGraph(compact));
            expect(progress).toHaveLength(solidColorTutorial.steps.length);
            expect(progress.every(Boolean)).toBe(true);
        }
    });
});
```

Add negative cases: wrong shader, disconnected node, missing output, nearby but incorrect value, an input overridden by a connection, missing texture ID, removed connection, and undo. Check that graph factories create fresh IDs and do not share objects between exercises.

Run:

```powershell
npm run typecheck
npm test
npm run build
npm run preview
```

Check the browser flow manually: complete the task without the solution button, load/reset, export/reimport, reject invalid files, test focus/keyboard, inspect mobile, verify English text, and render the shader. jsdom checks React integration, not the GPU.

`npm run test:browser` covers the included checker lesson's basic flows. For another lesson, add its actions and expectations to `scripts/verify-browser.mjs`, or document manual verification. The script does not discover an arbitrary lesson's workflow automatically.

## 8. Publish or embed a lesson

Distribute the compiled `dist/` files. Relative paths allow subdirectory hosting. The host must serve assets and all HTML entries without replacing them with the original application's single-page response.

For an iframe, use the compiled page's HTTP/HTTPS URL and provide enough height. After publishing under `/shader_tutorial/`:

```html
<iframe
    src="/shader_tutorial/tutorial.html"
    title="Checker material tutorial"
    style="width:100%;height:1500px;border:0"
    loading="lazy">
</iframe>
```

That path assumes you deployed the folder there. Creating the repository folder or Desktop copy does not register a route in the original application server. Configure hosting separately. If using iframe `sandbox` or CSP, allow only the features needed for scripts, modules, WebGL, workers, and JSON downloads, then test blocked functionality again.

## 9. Delivery checklist

- [ ] Objective and prerequisites match the actual exercise.
- [ ] HTML, steps, and solution describe the same recipe in English.
- [ ] HTML declares `lang="en"`.
- [ ] The registered lesson ID matches `data-tutorial`.
- [ ] The page is an HTML build entry.
- [ ] Initial and solution graphs are fresh on every call.
- [ ] Evaluation returns one boolean per step and follows the output chain.
- [ ] Criteria ignore position/zoom and correctly handle connected inputs.
- [ ] Missing textures and unavailable WebGL have useful feedback.
- [ ] Reset/solution clearly explain that they replace the graph.
- [ ] No APIs, tracking, or real-project dependencies are introduced.
- [ ] Tests, typecheck, and build pass, and the browser flow was inspected.
- [ ] Documentation explains that reloading discards unexported changes.
