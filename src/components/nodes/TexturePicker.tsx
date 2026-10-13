import { useContext } from 'react';
import { NodePracticeContext } from './NodePracticeContext';

export default function TexturePicker({ assetId, onPick }: {
    assetId: string | null;
    nodeId: string;
    materialId: string | null;
    onPick: (assetId: string | null, assetName: string | null) => void;
}) {
    const practice = useContext(NodePracticeContext);
    if (!practice) throw new Error('The texture picker requires NodePracticeContext.Provider.');
    const asset = practice.assets.find(entry => entry.id === assetId);
    return <div className="ne-image-asset">
        <div className="ne-image-preview">
            {asset ? <img src={asset.preview} alt={'Preview of ' + asset.name} /> : <span>No image</span>}
        </div>
        <span className="ne-image-name" title={asset?.name}>{asset?.name ?? 'No texture selected'}</span>
        <span className="ne-image-status" role="status">{asset ? 'Ready' : assetId ? 'Texture unavailable' : 'Choose a demo texture'}</span>
        <select className="ne-select" value={assetId ?? ''} aria-label="Demo texture"
            onChange={event => {
                const selected = practice.assets.find(entry => entry.id === event.target.value);
                onPick(selected?.id ?? null, selected?.name ?? null);
            }}>
            <option value="">— no texture —</option>
            {practice.assets.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
        <div className="ne-image-actions">
            <button type="button" disabled={!assetId} onClick={() => onPick(null, null)}>Remove image</button>
        </div>
    </div>;
}
