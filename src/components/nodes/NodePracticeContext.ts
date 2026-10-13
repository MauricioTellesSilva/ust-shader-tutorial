import { createContext } from 'react';
import type { EditorView, MaterialGraph } from '../../materials/nodes';
export interface NodePracticeState {
    graph: MaterialGraph;
    setGraph: (graph: MaterialGraph) => void;
    assets: { id: string; name: string; preview: string }[];
    selection: string[];
    setSelection: (selection: string[]) => void;
    view: EditorView;
    setView: (view: EditorView) => void;
    showError: (message: string) => void;
}
export const NodePracticeContext = createContext<NodePracticeState | null>(null);
