import {AbsoluteFill, useVideoConfig} from 'remotion';
import {G, SANS, V} from './brand';
import {timeline} from './timing';

export const BrandFrame = () => {
  const {width, height} = useVideoConfig(), w = G.window;
  return <AbsoluteFill style={{background: 'linear-gradient(145deg,#FAF7F1 0%,#DFE9FA 48%,#AFC8ED 100%)'}}>
    <svg width={width} height={height} style={{position: 'absolute', inset: 0, opacity: .045}}>
      <defs><filter id="aki-paper"><feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves={3} seed={17}/><feColorMatrix type="saturate" values="0"/></filter></defs>
      <rect width={width} height={height} filter="url(#aki-paper)"/>
    </svg>
    <div style={{position: 'absolute', left: w.x, top: w.y, width: w.w, height: w.h, borderRadius: w.r, background: V.window, boxShadow: '0 16px 48px rgba(30,65,120,.14)', border: '1.5px solid rgba(255,255,255,.85)'}}/>
    <div style={{position: 'absolute', left: w.x + 36, top: w.y + 27, display: 'flex', gap: 12}}>
      {['#E07B62', '#E3BD68', '#8BBFAE'].map(c => <div key={c} style={{width: 16, height: 16, borderRadius: '50%', background: c}}/>)}
    </div>
    <div style={{position: 'absolute', left: w.x + 28, top: G.headerBottom, width: w.w - 56, height: 1.5, background: '#DCE4F0'}}/>
    <div style={{position: 'absolute', right: width - (w.x + w.w) + 38, top: G.headerBottom - 42, fontFamily: SANS, fontSize: 20, letterSpacing: 2, color: '#73829A'}}>{timeline.column || 'AKI / AI EXPLAINED'}</div>
  </AbsoluteFill>;
};
