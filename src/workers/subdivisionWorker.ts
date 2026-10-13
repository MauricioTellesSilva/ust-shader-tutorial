import { subdivideTriangles, subdivisionTransfers, type SubdivisionData } from '../materials/nodes/geometry/subdivision';

self.onmessage = (event: MessageEvent<{ id: number; geometry: SubdivisionData; level: number }>) => {
    const { id, geometry, level } = event.data;
    try {
        const result = subdivideTriangles(geometry, level);
        self.postMessage({ id, geometry: result }, { transfer: subdivisionTransfers(result) });
    } catch (error) {
        self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
    }
};
