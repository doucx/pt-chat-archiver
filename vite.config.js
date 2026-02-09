import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';
import packageJson from './package.json';

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  plugins: [
    monkey({
      entry: 'src/main.js',
      userscript: {
        name: 'PonyTown 网页聊天记录存档器',
        namespace: 'http://tampermonkey.net/',
        version: packageJson.version,
        description:
          '自动将 pony.town 的聊天记录保存到浏览器本地存储，并提供查看、复制、下载、数据统计和清除界面。',
        author: 'doucx',
        match: ['https://pony.town/*', 'https://*.pony.town/*'],
        grant: ['GM_addStyle'],
        license: 'MIT',
        'run-at': 'document-idle',
      },
      build: {
        fileName: 'ponytown-chat-archiver.user.js',
      },
    }),
  ],
});
