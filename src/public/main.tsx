import '@fontsource/montserrat/300.css';
import '@fontsource/montserrat/500.css';
import '@fontsource/quicksand/400.css';
import '@fontsource/quicksand/500.css';
import '@fontsource/quicksand/600.css';
import '../styles/globals.css';
import '../styles/public.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ReferForm } from './ReferForm';

// Public referral form. Separate bundle: no app code, no data layer, no service worker.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ReferForm />
  </StrictMode>,
);
