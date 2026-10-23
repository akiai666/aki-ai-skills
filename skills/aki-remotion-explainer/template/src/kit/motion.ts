export type Point = {x: number; y: number};
export type Hands = {left: Point; right: Point};
export type Geometry = {width: number; height: number; anchor: Point; hands: Hands; feet?: Hands; bodyHeight?: number; contactSupported?: boolean};
export type MotionFrame = {src: string; hands: Hands; anchor?: Point; feet?: Hands};
export type MotionEvent = {frame: number; type: 'contact' | 'release'; hand: 'left' | 'right'; prop: string};
export type Motion = Geometry & {fps: number; frames: MotionFrame[]; loop?: {start: number; end: number} | null; events?: MotionEvent[]; label?: string; category?: string; scenarios?: string[]; status?: string; annotationStatus?: string};
export type MotionClock = {frame: number; fps: number};
export type MotionPlayback = {actionSince?: number; actionSpeed?: number; actionLoop?: boolean};
export type CharacterAsset = Geometry & {faces: Record<string, string | undefined>; poses?: Record<string, Geometry & {src: string}>; actions?: Record<string, Motion>};

export const selectCharacterAsset = (character: CharacterAsset, props: MotionPlayback & {action?: string; pose?: string; face?: string}, clock?: MotionClock): Geometry & {src: string} => {
  if (props.action) {
    if (!clock) throw new Error('Action hand coordinates require the same frame and fps as the character.');
    const motion = character.actions?.[props.action];
    if (!motion) throw new Error(`Missing character action: ${props.action}`);
    return sampleMotion(motion, clock, props).asset;
  }
  if (props.pose) {
    const pose = character.poses?.[props.pose];
    if (!pose) throw new Error(`Missing character pose: ${props.pose}`);
    return pose;
  }
  const src = character.faces[props.face ?? 'idle'];
  if (!src) throw new Error(`Missing character expression: ${props.face ?? 'idle'}`);
  return {...character, src};
};

export const sampleMotion = (motion: Motion, clock: MotionClock, playback: MotionPlayback = {}) => {
  const {actionSince = 0, actionSpeed = 1, actionLoop = false} = playback;
  if (![clock.frame, actionSince].every(Number.isFinite) || !Number.isFinite(clock.fps) || clock.fps <= 0 || !Number.isFinite(actionSpeed) || actionSpeed <= 0 || !Number.isFinite(motion.fps) || motion.fps <= 0 || !motion.frames.length) throw new Error('Invalid motion timing.');
  let index = Math.max(0, Math.floor((clock.frame - actionSince) * motion.fps * actionSpeed / clock.fps + 1e-8));
  if (actionLoop) {
    const loop = motion.loop;
    if (!loop || !Number.isInteger(loop.start) || !Number.isInteger(loop.end) || loop.start < 0 || loop.end <= loop.start || loop.end > motion.frames.length) throw new Error('This motion has no valid loop interval.');
    if (index >= loop.end) index = loop.start + (index - loop.start) % (loop.end - loop.start);
  }
  index = Math.min(index, motion.frames.length - 1);
  const asset = {...motion, ...motion.frames[index]};
  const contacts: Partial<Record<string, 'left' | 'right'>> = {};
  for (const event of motion.events ?? []) {
    if (event.frame > index) break;
    if (event.type === 'contact') contacts[event.prop] = event.hand;
    else delete contacts[event.prop];
  }
  return {index, asset, contacts};
};

export const transformPoint = (asset: Geometry, point: Point, actor: {x: number; y: number; h: number; flip?: boolean; rot?: number}): Point => {
  const k = actor.h / (asset.bodyHeight ?? asset.height), r = (actor.rot ?? 0) * Math.PI / 180;
  const dx = (point.x - asset.anchor.x) * k * (actor.flip ? -1 : 1), dy = (point.y - asset.anchor.y) * k;
  return {x: actor.x + dx * Math.cos(r) - dy * Math.sin(r), y: actor.y + dx * Math.sin(r) + dy * Math.cos(r)};
};

export const transformHandPoint = (asset: Geometry, hand: 'left' | 'right', actor: {x: number; y: number; h: number; flip?: boolean; rot?: number}): Point => {
  if (asset.contactSupported === false) throw new Error('Hand contact is not tracked for this asset. Keep props separate until coordinates are reviewed.');
  return transformPoint(asset, asset.hands[hand], actor);
};
