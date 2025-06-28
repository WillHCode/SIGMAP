import typescript from '@rollup/plugin-typescript';
import vue from '@rollup/plugin-vue';

export default {
    input: 'src/index.ts',
    external: ['@sigmap/webgpu-core', 'vue'],
    output: [
        { file: 'dist/index.esm.js', format: 'es' },
        { file: 'dist/index.cjs.js', format: 'cjs' }
    ],
    plugins: [
        vue(),
        typescript({ tsconfig: './tsconfig.json' })
    ]
};