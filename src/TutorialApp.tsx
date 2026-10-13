import { useRef, useState } from 'react';
import { defaultView, starterGraph, type EditorView, type MaterialGraph } from './materials/nodes';
import NodeEditor from './components/nodes/NodeEditor';
import { NodePracticeContext } from './components/nodes/NodePracticeContext';
import MaterialPreview from './components/MaterialPreview';
import { demoAssets } from './tutorials/assets';
import type { TutorialDefinition } from './tutorials/types';
import { graphJson, MAX_GRAPH_BYTES, parseGraphJson } from './graphFiles';

function compactScreen(): boolean {
    return window.matchMedia?.('(max-width:800px)').matches ?? window.innerWidth <= 800;
}

function startingView(): EditorView {
    return { ...defaultView(), x: 10, y: 10, zoom: compactScreen() ? 0.6 : 0.85 };
}

export default function TutorialApp({ tutorial }: { tutorial?: TutorialDefinition }) {
    const [graph, setGraph] = useState(() => tutorial?.createInitialGraph(compactScreen()) ?? starterGraph());
    const [selection, setSelection] = useState<string[]>([]);
    const [view, setView] = useState(startingView);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [version, setVersion] = useState(0);
    const [importing, setImporting] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);
    const progress = tutorial?.evaluate(graph) ?? [];
    const completed = progress.filter(Boolean).length;
    const firstPending = progress.findIndex(done => !done);

    const replaceGraph = (next: MaterialGraph) => {
        setGraph(next);
        setSelection([]);
        setView(startingView());
        setError('');
        setNotice('');
        setVersion(current => current + 1);
    };

    const exportGraph = () => {
        const blob = new Blob([graphJson(graph)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = (tutorial?.id ?? 'material') + '.json';
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        setNotice('Graph exported. Textures reference the local examples; image files are not included.');
    };

    const importGraph = async (file: File) => {
        setImporting(true);
        setError('');
        setNotice('');
        try {
            if (file.size > MAX_GRAPH_BYTES) throw new Error('The graph must not exceed 1 MB.');
            replaceGraph(parseGraphJson(await file.text()));
            setNotice('Graph imported. The previous undo history has been reset.');
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'The graph could not be imported.');
        } finally {
            setImporting(false);
        }
    };

    return <section className="tutorial-app" aria-label={tutorial?.title ?? 'Material editor'}>
        {tutorial && <section className="lesson-panel" aria-labelledby="lesson-title">
            <div className="lesson-heading"><div><span className="eyebrow">INTERACTIVE EXERCISE</span>
                <h2 id="lesson-title">{tutorial.title}</h2><p>{tutorial.objective}</p></div>
                <span className="lesson-count" aria-live="polite">{completed}/{tutorial.steps.length}</span>
            </div>
            <label className="progress-label" htmlFor="lesson-progress">Completed steps</label>
            <progress id="lesson-progress" max={tutorial.steps.length} value={completed} />
            <ol className="lesson-steps">{tutorial.steps.map((step, index) => <li key={step.id}
                data-complete={progress[index]} aria-current={index === firstPending ? 'step' : undefined}>
                <span className="step-number" aria-hidden="true">{progress[index] ? '✓' : index + 1}</span>
                <div><strong>{step.title}</strong><p>{step.instruction}</p></div>
                <span className="sr-only">{progress[index] ? 'Complete' : 'Pending'}</span>
            </li>)}</ol>
            {completed === tutorial.steps.length && <p className="completion" role="status">{tutorial.completion}</p>}
        </section>}
        <div className="workspace-heading"><div><h2>Material lab</h2>
            <p>Drag nodes by their headers. Use the mouse wheel to zoom and drag the background to pan.</p></div>
            <span className="local-badge">Local · no account · no backend</span>
        </div>
        <div className="workspace-actions">
            <button type="button" disabled={importing} onClick={() => replaceGraph(tutorial?.createInitialGraph(compactScreen()) ?? starterGraph())}>Reset exercise</button>
            {tutorial && <button type="button" disabled={importing} onClick={() => {
                replaceGraph(tutorial.createSolutionGraph(compactScreen()));
                setNotice('Completed example loaded. Reset the exercise to build the material yourself.');
            }}>Load completed example</button>}
            <button type="button" onClick={exportGraph}>Export JSON</button>
            <button type="button" disabled={importing} onClick={() => fileInput.current?.click()}>{importing ? 'Importing…' : 'Import JSON'}</button>
            <input ref={fileInput} type="file" hidden accept=".json,application/json" aria-label="JSON graph file"
                onChange={event => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (file) void importGraph(file);
                }} />
        </div>
        {error && <p className="message error" role="alert">{error}</p>}
        {notice && <p className="message" role="status">{notice}</p>}
        <div className="material-workspace">
            <NodePracticeContext.Provider value={{ graph, setGraph, assets: tutorial?.assets ?? demoAssets,
                selection, setSelection, view, setView, showError: setError }}>
                <div className="editor-frame"><NodeEditor key={version} /></div>
            </NodePracticeContext.Provider>
            <aside className="preview-panel" aria-label="Material result">
                <div className="preview-heading"><h3>3D preview</h3><span>Test sphere</span></div>
                <MaterialPreview graph={graph} />
                <p>Drag to rotate. The preview uses the same graph as the editor, with fixed lighting.</p>
                <dl className="graph-stats"><div><dt>Nodes</dt><dd>{graph.nodes.length}</dd></div>
                    <div><dt>Connections</dt><dd>{graph.connections.length}</dd></div></dl>
            </aside>
        </div>
        <p className="session-note">Changes are stored only on this page. Export the JSON before reloading or closing it. Resetting or loading an example replaces the graph and clears the undo history.</p>
    </section>;
}
