import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import { string } from 'rollup-plugin-string';


export default {
    input: 'src/index.ts',
    output: [
        { file: 'dist/index.esm.js', format: 'es' },
        { file: 'dist/index.cjs.js', format: 'cjs' }
    ],
    plugins: [
        // load .wgsl files as raw text
        string({
            include: '**/*.wgsl'
        }),

        resolve({
            extensions: ['.ts', '.js']
        }),
        typescript({
            tsconfig: './tsconfig.json',
            outputToFilesystem: false
        })
    ]
};
