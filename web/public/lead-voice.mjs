// Model D-inspired subtractive lead; not a circuit-level ladder-filter emulation.
export const LEAD_DEFAULTS={base:440,octaves:2,response:.12,depth:35,rate:5,volume:.15,detune:5,cutoff:4200,resonance:1.2};
export function createLeadVoice(context){
 const mix=context.createGain(),drive=context.createWaveShaper(),filter=context.createBiquadFilter(),second=context.createBiquadFilter(),gain=context.createGain(),lfo=context.createOscillator(),depth=context.createGain();
 mix.gain.value=.5;gain.gain.value=0;depth.gain.value=0;
 const curve=new Float32Array(2049);for(let i=0;i<curve.length;i++){const x=i/(curve.length-1)*2-1;curve[i]=Math.tanh(x*1.4)/Math.tanh(1.4);}drive.curve=curve;drive.oversample='2x';
 filter.type=second.type='lowpass';second.Q.value=Math.SQRT1_2;
 mix.connect(drive).connect(filter).connect(second).connect(gain).connect(context.destination);
 lfo.connect(depth);
 const oscillators=['sawtooth','sawtooth','square'].map((type,i)=>{const oscillator=context.createOscillator(),level=context.createGain();oscillator.type=type;level.gain.value=i===2?.16:.42;oscillator.connect(level).connect(mix);depth.connect(oscillator.detune);oscillator.start();return oscillator;});lfo.start();
 const target=(param,value,time)=>param.setTargetAtTime(value,context.currentTime,time);
 return {update(voice,settings){const s={...LEAD_DEFAULTS,...settings};oscillators.forEach((osc,i)=>{target(osc.frequency,voice.frequency*(i===2?.5:1),s.response);target(osc.detune,i===0?-s.detune:i===1?s.detune:0,.05);});target(filter.frequency,Math.min(context.sampleRate*.45,s.cutoff+voice.frequency*.5),.06);target(second.frequency,Math.min(context.sampleRate*.45,s.cutoff+voice.frequency*.5),.06);target(filter.Q,s.resonance,.06);target(gain.gain,voice.volume*s.volume*.25,s.response);target(depth.gain,voice.vibrato,s.response);target(lfo.frequency,s.rate,.1);},silence(){target(gain.gain,0,.025);target(depth.gain,0,.025);}};
}
