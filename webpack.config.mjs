import path from 'path';
import url from 'url';

const fileName = url.fileURLToPath(import.meta.url),
    dirName = path.dirname(fileName);

export default {
    entry: './src/index.mts',
    devtool: 'source-map',
    mode: 'production',
    experiments: {
        outputModule: true
    },
    resolve: {
        extensions: ['.mts', '.mjs', '.ts', '.js', '.json'],
        extensionAlias: {
            '.js': ['.ts', '.js'],
            '.mjs': ['.mts', '.mjs'],
            '.mts': ['.mts']
        }
    },
    module: {
        rules: [
            {
                test: /\.mts$/,
                use: 'ts-loader',
                exclude: /node_modules/
            }
        ]
    },
    output: {
        clean: true,
        library: {
            type: 'module'
        },
        module: true,
        filename: 'index.mjs',
        path: path.resolve(dirName, 'dist')
    }
};