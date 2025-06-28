import typescript from '@rollup/plugin-typescript';

export default {
    input: 'src/index.ts',
    external: ['@sigmap/webgpu-core', '@angular/core'],
    output: [
        { file: 'dist/index.esm.js', format: 'es' },
        { file: 'dist/index.cjs.js', format: 'cjs' }
    ],
    plugins: [
        typescript({ tsconfig: './tsconfig.json' })
    ]
};