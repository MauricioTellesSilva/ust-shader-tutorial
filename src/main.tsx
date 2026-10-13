import { createRoot } from 'react-dom/client';
import TutorialApp from './TutorialApp';
import { tutorials } from './tutorials';
import './styles/tutorial.css';
import './styles/nodes.css';

const mount = document.getElementById('shader-tutorial');
if (!mount) throw new Error('Add <div id="shader-tutorial"></div> to the HTML.');
const tutorialId = mount.dataset.tutorial;
const tutorial = tutorialId ? tutorials[tutorialId] : undefined;
if (tutorialId && !tutorial) {
    mount.textContent = 'Unknown tutorial: ' + tutorialId + '. Check src/tutorials/index.ts.';
} else {
    createRoot(mount).render(<TutorialApp tutorial={tutorial} />);
}
