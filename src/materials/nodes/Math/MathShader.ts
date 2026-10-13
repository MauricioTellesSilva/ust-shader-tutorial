// Mantém resultados representáveis num float do shader. Operações fora do
// domínio e overflow produzem zero, sem contaminar o restante material com NaN.
const MAX_FLOAT = 3.402823e38;

export function finiteResult(value: number): number {
    return Number.isFinite(value) && Math.abs(value) <= MAX_FLOAT ? value : 0;
}

export const MATH_HELPERS = /* glsl */ `
float ndMathFinite(float value) {
    return abs(value) <= 3.402823e38 ? value : 0.0;
}

float ndMathDivide(float a, float b) {
    if (b == 0.0) return 0.0;
    return a / b;
}

float ndMathModulo(float a, float b) {
    if (b == 0.0) return 0.0;
    return a - b * floor(a / b);
}

float ndMathPower(float a, float b) {
    if (a == 0.0) return b == 0.0 ? 1.0 : 0.0;
    if (a < 0.0) {
        if (b != floor(b)) return 0.0;
        float magnitude = pow(-a, b);
        return mod(b, 2.0) == 0.0 ? magnitude : -magnitude;
    }
    return pow(a, b);
}
`;
