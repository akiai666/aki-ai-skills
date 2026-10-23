import React from 'react';
import {Img, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import data from '../data/character.json';
import {selectCharacterAsset, transformHandPoint} from './motion';
import type {Point, Geometry, Motion, MotionClock, MotionPlayback} from './motion';

export type Face = 'idle' | 'doubt' | 'surprise' | 'happy';
type Pose = Geometry & {src: string};
type Character = Geometry & {faces: Partial<Record<Face, string>>; poses?: Record<string, Pose>; actions?: Record<string, Motion>};
const character = data as Character;
export type AkiCharacterProps = MotionPlayback & {x: number; y: number; h: number; action?: string; pose?: string; face?: Face; faceSince?: number; flip?: boolean; rot?: number; shadow?: number; seed?: number; style?: React.CSSProperties};

export const characterPoint = (props: AkiCharacterProps, hand: 'left' | 'right' = 'right', clock?: MotionClock): Point => {
  const asset = selectCharacterAsset(character, props, clock);
  return transformHandPoint(asset, hand, props);
};

export const AkiCharacter: React.FC<AkiCharacterProps> = (props) => {
  const frame = useCurrentFrame(), {fps} = useVideoConfig();
  const {x, y, h, flip = false, rot = 0, shadow = 1, style} = props;
  const asset = selectCharacterAsset(character, props, {frame, fps}), src = asset.src;
  const k = h / (asset.bodyHeight ?? asset.height), w = asset.width * k, ax = asset.anchor.x * k, ay = asset.anchor.y * k;
  const shadowWidth = (asset.feet ? Math.abs(asset.feet.right.x - asset.feet.left.x) * k + h * .14 : w * .64) * shadow;
  return <>
    {shadow > 0 && <div style={{position: 'absolute', left: x - shadowWidth / 2, top: y - 5, width: shadowWidth, height: 16 * shadow, borderRadius: '50%', background: '#1B1E24', opacity: .12 * shadow}}/>}
    <div style={{position: 'absolute', left: x - ax, top: y - ay, width: w, height: asset.height * k, transformOrigin: `${ax}px ${ay}px`, transform: `rotate(${rot}deg) scaleX(${flip ? -1 : 1})`, ...style}}>
      <Img src={staticFile(src)} style={{width: '100%', height: '100%', objectFit: 'contain'}}/>
    </div>
  </>;
};

export const useFace = (cues: [number, Face, number][]) => {
  const frame = useCurrentFrame();
  const hit = [...cues].reverse().find(([at, , duration]) => frame >= at && frame < at + duration);
  return {face: hit?.[1] ?? 'idle' as Face, since: hit?.[0] ?? -99};
};

export const useHop = (from: number, period = 36, air = 10, amp = 12) => {
  const frame = useCurrentFrame();
  if (frame < from || amp <= 0) return {dy: 0, shadow: 1};
  const t = (frame - from) % period, lift = t < air ? Math.sin(Math.PI * t / air) * amp : 0;
  return {dy: -lift, shadow: 1 - lift / amp * .45};
};
