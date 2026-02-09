import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

export default defineConfig({
  plugins: [
    monkey({
      entry: 'src/main.js',
      userscript: {
        name: 'PonyTown Chat Archiver',
        namespace: 'http://tampermonkey.net/',
        version: '5.5.0',
        description: '自动将 pony.town 的聊天记录保存到浏览器本地存储，并提供查看、复制、下载、数据统计和清除界面。',
        author: 'doucx',
        match: [
          'https://pony.town/*',
          'https://*.pony.town/*'
        ],
        grant: ['GM_addStyle'],
        license: 'MIT',
        'run-at': 'document-idle',
      },
      server: {
        mountGmApi: true,
      },
      build: {
        fileName: 'ponytown-chat-archiver.user.js',
      },
    }),
  ],
});