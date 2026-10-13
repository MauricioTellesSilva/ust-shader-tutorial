import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    base: './',
    plugins: [react()],
    build: {
        rolldownOptions: {
            input: {
                editor: resolve(import.meta.dirname, 'index.html'),
                tutorial: resolve(import.meta.dirname, 'tutorial.html'),
            },
        },
    },
    test: {
        environment: 'jsdom',
        include: ['src/**/*.test.{ts,tsx}'],
    },
});
