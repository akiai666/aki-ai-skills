import {useCurrentFrame, interpolate} from 'remotion';
import {HAND, V, G} from '../kit/brand';
import {AkiCharacter} from '../kit/AkiCharacter';

export const S01 = () => {
  const f = useCurrentFrame(), a = G.art.full;
  const shift = interpolate(f, [0, 30], [70, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return <>
    <AkiCharacter x={a.x + a.w * .24 - shift} y={a.y + a.h * .9} h={a.h * .72}/>
    <div style={{position: 'absolute', left: a.x + a.w * .46, top: a.y + a.h * .22, width: a.w * .48, fontFamily: HAND, color: V.ink}}>
      <div style={{fontSize: a.w * .055, lineHeight: 1.25, color: V.blue}}>把想法讲清楚</div>
      <div style={{marginTop: 38, fontSize: a.w * .027, lineHeight: 1.6}}>一段话，一个画面<br/>让角色把关系演出来</div>
    </div>
  </>;
};
