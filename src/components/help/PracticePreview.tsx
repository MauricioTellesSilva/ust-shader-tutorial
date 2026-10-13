import { Component, useEffect, useState, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { MathUtils, PerspectiveCamera } from 'three';
import { t, useLanguage } from '../../i18n';

const PREVIEW_FOV = 45;
function PreviewCamera() {
    const { camera, size, invalidate } = useThree();
    useEffect(() => {
        if (!(camera instanceof PerspectiveCamera) || size.width <= 0 || size.height <= 0) return;
        // Preserve framing along the shorter dimension when the preview is tall.
        const aspect = Math.min(size.width / size.height, 1);
        camera.fov = MathUtils.radToDeg(2 * Math.atan(Math.tan(MathUtils.degToRad(PREVIEW_FOV) / 2) / aspect));
        camera.updateProjectionMatrix();
        invalidate();
    }, [camera, size.width, size.height, invalidate]);
    return null;
}

class PreviewBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
function webGLAvailable() {
    try {
        if (typeof WebGL2RenderingContext === 'undefined') return false;
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('webgl2');
        if (!context) return false;
        context.getExtension('WEBGL_lose_context')?.loseContext();
        return true;
    } catch { return false; }
}
// Keep the exercise mounted if WebGL creation or the preview renderer fails.
export default function PracticePreview({ children }: { children: ReactNode }) {
    useLanguage();
    const [available] = useState(webGLAvailable);
    const fallback = <p className="practice-preview-fallback" role="status">{t('helpPreviewFallback')}</p>;
    return <div className="practice-model"><PreviewBoundary fallback={fallback}>
        {available ? <Canvas aria-label={t('practicePreview')} fallback={fallback} camera={{ position: [2.8, 1.7, 3.4], fov: PREVIEW_FOV }}>
            <PreviewCamera />
            <ambientLight intensity={0.9} /><directionalLight position={[3, 5, 4]} intensity={2.5} />{children}
        </Canvas> : fallback}
    </PreviewBoundary></div>;
}
