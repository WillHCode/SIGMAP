import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';

export default {
    input: 'src/index.ts',
    output: [
        { file: 'dist/index.esm.js', format: 'es' },
        { file: 'dist/index.cjs.js', format: 'cjs' }
    ],
    plugins: [
        resolve({
            extensions: ['.ts', '.js']
        }),
        typescript({
            tsconfig: './tsconfig.json',
            outputToFilesystem: false
        })
    ]
};
