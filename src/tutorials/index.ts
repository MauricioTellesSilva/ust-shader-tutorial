import { checkerTutorial } from './checker';
import type { TutorialDefinition } from './types';

export const tutorials: Record<string, TutorialDefinition> = {
    checker: checkerTutorial,
};
