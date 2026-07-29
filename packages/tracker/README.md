# @cairo/tracker

Universal Segment-style event tracking SDK for [Cairo](https://github.com/outcome-driven-studio/cairo).

```bash
npm install @cairo/tracker
```

```ts
import { Cairo } from '@cairo/tracker';

const cairo = Cairo.init({
  writeKey: process.env.CAIRO_WRITE_KEY!,
  host: 'https://your-cairo-instance.com',
});

cairo.track({ event: 'signup', userId: 'u1', properties: { plan: 'free' } });
cairo.identify({ userId: 'u1', traits: { email: 'a@b.com' } });
await cairo.shutdown();
```

Posts to `${host}/v2/batch`.
