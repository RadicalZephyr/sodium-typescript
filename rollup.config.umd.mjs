import replace from '@rollup/plugin-replace';
import typescript from '@rollup/plugin-typescript';

export default [
    {
        input: './src/lib/Lib.ts',
        external: [ 'typescript-collections', 'sanctuary-type-classes'],
        output: [
          { file: "dist/sodium.umd.min.js", name: "Sodium", format: 'umd', sourcemap: true,
            globals: {
                'typescript-collections': 'Collections',
                'sanctuary-type-classes': 'Z'
            }
          },
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
