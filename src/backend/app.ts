import fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'path';
import fs from 'fs';
import { auth } from './routes/auth';
import { api } from './routes/api';
import { initDatabase } from './init-db';

initDatabase();

const app = fastify();

app.register(auth, { prefix: '/auth' });
app.register(api, { prefix: '/api' });

app.register(fastifyStatic, {
  root: path.join(__dirname, '../static/html'),
  decorateReply: true,
  serve: false
});

fs.readdirSync(path.join(__dirname, `../static/html`)).forEach(i => {
  if (!i.endsWith('.html') || i == '404.html') {
    return;
  }
  app.get(`/${i.replace('index.html', '').replace(/\.html$/, '')}`, (_req, res) => {
    return res.sendFile(i, path.join(__dirname, `../static/html`));
  });
});

app.setNotFoundHandler((_req, res) => {
  res.code(404).sendFile('404.html', path.join(__dirname, '../static/html'));
});

for (const i of ['js', 'css', 'images']) {
  app.register(fastifyStatic, {
    root: path.join(__dirname, `../static/${i}`),
    prefix: `/${i}/`,
    decorateReply: false
  });
}

app.listen({ port: 5501 }, () => {
  console.log(`Running at http://localhost:5501`);
});