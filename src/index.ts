import { Hono } from 'hono'
import user from './routes/user';
import blog from './routes/blog';
import { cors } from 'hono/cors';

const app = new Hono().basePath("api/v1");

app.use('*', cors())
app.use(
  '*',
  cors({
    origin: 'http://localhost:5173',
    allowHeaders: ['X-Custom-Header', 'Upgrade-Insecure-Requests','Authorization'],
    allowMethods: ['POST', 'GET', 'OPTIONS'],
    exposeHeaders: ['Content-Length', 'X-Kuma-Revision'],
    maxAge: 600,
    credentials: true,
  })
)

app.route("/user",user);

app.route("/blog",blog);

export default app