import replace from '@rollup/plugin-replace';
import typescript from '@rollup/plugin-typescript';
import { readFileSync } from 'fs';

// Rollup 4 loads this config as an ES module, where importing JSON needs an
// import attribute. Reading it works on every Node we support.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default [
    {
        input: './src/lib/Lib.ts',
        external: [ 'typescript-collections', 'sanctuary-type-classes'],
        output: [
          { file: pkg.module, format: 'es', sourcemap: true },
          { file: pkg.main, format: 'cjs', sourcemap: true },
        ],
        plugins: [
            replace({
                'process.env.NODE_ENV': JSON.stringify( process.env['NODE_ENV'] ),
                preventAssignment: true
            }),

            typescript({
                // Declarations are emitted separately by the typings:emit
                // script, which is more thorough than the bundler's view.
                declaration: false,
                declarationMap: false
            })
        ]
    }
];
