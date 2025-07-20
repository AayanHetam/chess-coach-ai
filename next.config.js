/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Handle Web Workers
    config.module.rules.push({
      test: /\.worker\.(js|ts)$/,
      use: { loader: 'worker-loader' },
    });

    // Handle WASM files
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };

    // Allow loading from CDN
    config.module.rules.push({
      test: /\.js$/,
      include: /node_modules\/stockfish\.js/,
      use: {
        loader: 'babel-loader',
        options: {
          presets: ['@babel/preset-env'],
        },
      },
    });

    return config;
  },
};

module.exports = nextConfig;
