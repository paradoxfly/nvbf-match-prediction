import { product } from '@predict/brand';
import { ImageResponse } from 'next/og';

export const alt = `${product.name} — daily volleyball predictions`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Link preview for every page. */
export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: '#0A0A0A',
        color: '#FFFFFF',
        padding: 64,
        fontFamily: 'sans-serif',
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 32, fontWeight: 900 }}
      >
        <div style={{ width: 56, height: 56, borderRadius: 16, background: '#FFD400' }} />
        {product.wordmark}
        <span style={{ color: '#FFD400' }}>.</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div
          style={{
            display: 'flex',
            fontSize: 104,
            fontWeight: 900,
            letterSpacing: -4,
            lineHeight: 1,
          }}
        >
          call every set.
        </div>
        <div style={{ display: 'flex', fontSize: 40, color: '#FFD400', fontWeight: 900 }}>
          win every day.
        </div>
      </div>
      <div style={{ display: 'flex', fontSize: 26, color: 'rgba(255,255,255,0.65)' }}>
        Daily volleyball predictions · cash prizes · league jackpot
      </div>
    </div>,
    size,
  );
}
