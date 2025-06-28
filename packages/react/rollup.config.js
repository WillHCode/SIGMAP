import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    build: {
        lib: {
            entry: 'src/index.tsx',
            name: 'WebGPUReact',
            formats: ['es', 'cjs', 'umd'],
            fileName: (format) => `index.${format}.js`
        },
        rollupOptions: {
            external: ['react', '@sigmap/webgpu-core'],
            output: {
                globals: {
                    react: 'React',
                    '@sigmap/webgpu-core': 'WebGPUCore'
                }
            }
        }
    }
});