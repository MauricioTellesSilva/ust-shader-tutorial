import type { MaterialGraph } from '../materials/nodes';
import type { NodePracticeState } from '../components/nodes/NodePracticeContext';

export interface TutorialDefinition {
    id: string;
    title: string;
    objective: string;
    completion: string;
    assets: NodePracticeState['assets'];
    createInitialGraph: (compact: boolean) => MaterialGraph;
    createSolutionGraph: (compact: boolean) => MaterialGraph;
    steps: { id: string; title: string; instruction: string }[];
    evaluate: (graph: MaterialGraph) => boolean[];
}
