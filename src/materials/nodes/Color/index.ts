/**
 * Os nós de cor.
 *
 * Tudo o que pega numa cor e devolve outra. Todos marcados `gpu` menos o RGB,
 * que é uma constante e vale o mesmo dos dois lados — e é essa excepção que faz
 * uma cadeia de constantes continuar a não precisar de shader gerado nenhum.
 */
import type { NodeDefinition } from '../core/types';
import { brightnessContrast } from './BrightnessContrast/BrightnessContrast';
import { colorRamp } from './ColorRamp/ColorRamp';
import { gamma } from './Gamma/Gamma';
import { hueSaturationValue } from './HueSaturationValue/HueSaturationValue';
import { invertColor } from './InvertColor/InvertColor';
import { mixColor } from './MixColor/MixColor';
import { rgbColor } from './RGBColor/RGBColor';

export { NODE_BRIGHTNESS_CONTRAST } from './BrightnessContrast/BrightnessContrast';
export { NODE_COLOR_RAMP } from './ColorRamp/ColorRamp';
export { NODE_GAMMA } from './Gamma/Gamma';
export { NODE_HUE_SATURATION_VALUE } from './HueSaturationValue/HueSaturationValue';
export { NODE_INVERT_COLOR } from './InvertColor/InvertColor';
export { NODE_MIX_COLOR } from './MixColor/MixColor';
export { NODE_RGB_COLOR } from './RGBColor/RGBColor';

export const colorNodes: NodeDefinition[] = [
    rgbColor,
    mixColor,
    colorRamp,
    brightnessContrast,
    hueSaturationValue,
    gamma,
    invertColor,
];
