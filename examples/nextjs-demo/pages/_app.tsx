import { AppProps } from 'next/app';
import { CairoProvider } from '@cairo/react';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <CairoProvider
      writeKey={process.env.NEXT_PUBLIC_CAIRO_WRITE_KEY || 'demo-key'}
      config={{
        dataPlaneUrl: process.env.NEXT_PUBLIC_CAIRO_URL || 'http://localhost:8080',
        debug: process.env.NODE_ENV === 'development',
        autoTrack: {
          pageViews: true,
          formSubmissions: true,
          clicks: false,
          performance: true,
        },
        consent: {
          required: false,
        },
      }}
    >
      <Component {...pageProps} />
    </CairoProvider>
  );
}