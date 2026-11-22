import {approvedClips,vowelClipId} from './vowel-audio-review.js?v=2';
// Retain approved clips. For the repaired group use the female introduction and full example word.
export const repairedFullClips=new Set([8,11,12,14,22,23,25,35,36,38,52,53,58,70,74,75,80,83]);
export const repairedPartialClips=new Set();
export function driveAudioSource(id){if(repairedFullClips.has(id)||repairedPartialClips.has(id))return '/assets/vowel-drive-audio-v5/'+id+'.mp3';return approvedClips.has(id)?'/assets/vowel-drive-audio-v3/'+id+'.mp3':null}
export function sharedAudioSource(src){const id=vowelClipId(src);if(id===null)return src;if(repairedPartialClips.has(id))return null;return driveAudioSource(id)}
