import type { InputDefinition, NodeDefinition } from '../core/types';
import { MATH_HELPERS, finiteResult } from './MathShader';

export const NODE_ADD = 'mathAdd';
export const NODE_SUBTRACT = 'mathSubtract';
export const NODE_MULTIPLY = 'mathMultiply';
export const NODE_DIVIDE = 'mathDivide';
export const NODE_POWER = 'mathPower';
export const NODE_MODULO = 'mathModulo';
export const NODE_MINIMUM = 'mathMinimum';
export const NODE_MAXIMUM = 'mathMaximum';
export const NODE_ABSOLUTE = 'mathAbsolute';
export const NODE_SQUARE_ROOT = 'mathSquareRoot';
export const NODE_FLOOR = 'mathFloor';
export const NODE_CEIL = 'mathCeil';
export const NODE_ROUND = 'mathRound';
export const NODE_FRACTION = 'mathFraction';
export const NODE_SINE = 'mathSine';
export const NODE_COSINE = 'mathCosine';
export const NODE_TANGENT = 'mathTangent';
export const NODE_CLAMP = 'mathClamp';

function input(id: string, label: string, defaultValue: number): InputDefinition {
    // Sem limites de 0–1: cálculos intermédios podem ser negativos ou maiores que um.
    return { id, label, type: 'FLOAT', defaultValue, step: 0.01 };
}

function mathNode(
    type: string,
    label: string,
    inputs: InputDefinition[],
    calculate: (...values: number[]) => number,
    expression: (...values: string[]) => string,
): NodeDefinition {
    return {
        type,
        label,
        category: 'math',
        // Uma imagem transformada deve ser amostrada por pixel, mesmo sem ruído
        // procedural na cadeia. Os cálculos constantes também são avaliados no CPU.
        gpu: true,
        inputs,
        outputs: [{ id: 'value', label: 'Value', type: 'FLOAT' }],
        evaluate: (ctx) => ({
            value: { number: finiteResult(calculate(...inputs.map((i) => ctx.float(i.id)))) },
        }),
        emit: (ctx) => {
            ctx.helper('ndMath', MATH_HELPERS);
            return {
                value: ctx.temp('float', `ndMathFinite(${expression(...inputs.map((i) => ctx.input(i.id)))})`),
            };
        },
    };
}

function binary(
    type: string,
    label: string,
    calculate: (a: number, b: number) => number,
    expression: (a: string, b: string) => string,
    defaultB = 0.5,
): NodeDefinition {
    return mathNode(type, label, [input('a', 'A', 0.5), input('b', 'B', defaultB)], calculate, expression);
}

function unary(
    type: string,
    label: string,
    calculate: (value: number) => number,
    expression: (value: string) => string,
): NodeDefinition {
    return mathNode(type, label, [input('value', 'Value', 0.5)], calculate, expression);
}

export const mathNodes: NodeDefinition[] = [
    binary(NODE_ADD, 'Add', (a, b) => a + b, (a, b) => `(${a} + ${b})`),
    binary(NODE_SUBTRACT, 'Subtract', (a, b) => a - b, (a, b) => `(${a} - ${b})`),
    binary(NODE_MULTIPLY, 'Multiply', (a, b) => a * b, (a, b) => `(${a} * ${b})`, 1),
    binary(NODE_DIVIDE, 'Divide', (a, b) => (b === 0 ? 0 : a / b), (a, b) => `ndMathDivide(${a}, ${b})`, 1),
    binary(NODE_POWER, 'Power', (a, b) => (a === 0 && b < 0 ? 0 : a ** b), (a, b) => `ndMathPower(${a}, ${b})`, 2),
    // Modulo e Fraction seguem GLSL: o resto acompanha o sinal do divisor.
    binary(NODE_MODULO, 'Modulo', (a, b) => (b === 0 ? 0 : a - b * Math.floor(a / b)), (a, b) => `ndMathModulo(${a}, ${b})`, 1),
    binary(NODE_MINIMUM, 'Minimum', Math.min, (a, b) => `min(${a}, ${b})`),
    binary(NODE_MAXIMUM, 'Maximum', Math.max, (a, b) => `max(${a}, ${b})`),
    unary(NODE_ABSOLUTE, 'Absolute', Math.abs, (v) => `abs(${v})`),
    unary(NODE_SQUARE_ROOT, 'Square Root', (v) => Math.sqrt(Math.max(v, 0)), (v) => `sqrt(max(${v}, 0.0))`),
    unary(NODE_FLOOR, 'Floor', Math.floor, (v) => `floor(${v})`),
    unary(NODE_CEIL, 'Ceil', Math.ceil, (v) => `ceil(${v})`),
    unary(NODE_ROUND, 'Round', (v) => Math.floor(v + 0.5), (v) => `floor(${v} + 0.5)`),
    unary(NODE_FRACTION, 'Fraction', (v) => v - Math.floor(v), (v) => `fract(${v})`),
    // Ângulos em radianos, tanto no CPU como no shader.
    unary(NODE_SINE, 'Sine', Math.sin, (v) => `sin(${v})`),
    unary(NODE_COSINE, 'Cosine', Math.cos, (v) => `cos(${v})`),
    unary(NODE_TANGENT, 'Tangent', Math.tan, (v) => `tan(${v})`),
    mathNode(
        NODE_CLAMP, 'Clamp',
        [input('value', 'Value', 0.5), input('min', 'Min', 0), input('max', 'Max', 1)],
        (v, min, max) => Math.min(Math.max(v, Math.min(min, max)), Math.max(min, max)),
        (v, min, max) => `clamp(${v}, min(${min}, ${max}), max(${min}, ${max}))`,
    ),
];
