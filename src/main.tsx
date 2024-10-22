import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WeddingPhotoGalleryComponent } from "@/components/wedding-photo-gallery.tsx";

const container = document.getElementById('root');

if (!container) {
  throw new Error('No root element found!');
}

const root = createRoot(container);

root.render(
  <StrictMode>
    <WeddingPhotoGalleryComponent />
  </StrictMode>
);
