// CIE coordinates from explicitly declared RGB primaries and transfer.
// Own implementation of standard colourimetry; no project-space inference.
export const CIE_PRIMARIES={
 bt709:{name:'Rec.709',rgb:[[.64,.33],[.30,.60],[.15,.06]],white:[.3127,.3290],matrix:[.4123907993,.3575843394,.1804807884,.2126390059,.7151686788,.0721923154,.0193308187,.1191947798,.9505321522]},
 p3d65:{name:'P3-D65',rgb:[[.68,.32],[.265,.69],[.15,.06]],white:[.3127,.3290],matrix:[.4865709486,.2656676932,.1982172852,.2289745641,.6917385218,.0792869141,0,.0451133819,1.0439443689]},
 bt2020:{name:'Rec.2020',rgb:[[.708,.292],[.170,.797],[.131,.046]],white:[.3127,.3290],matrix:[.6369580483,.1446169036,.1688809752,.2627002120,.6779980715,.0593017165,0,.0280726930,1.0609850577]}
};
export const CIE_TRANSFERS=['unset','linear','gamma22','gamma24','gamma26','srgb','bt709','pq','hlg'];
export function cieConfig(input={}){
 const ciePrimaries=input.ciePrimaries??'unset',cieTransfer=input.cieTransfer??'unset',cieModel=input.cieModel??'xy';
 if(ciePrimaries!=='unset'&&!CIE_PRIMARIES[ciePrimaries]||!CIE_TRANSFERS.includes(cieTransfer)||!['xy','uv'].includes(cieModel))throw Error('Invalid CIE input primaries, transfer or plot');
 return {ciePrimaries,cieTransfer,cieModel,cieSize:512*(input.vectorDisplayScale??1)};
}
export function cieReady(c){return c.ciePrimaries!=='unset'&&c.cieTransfer!=='unset';}
export function cieBounds(model){return model==='uv'?[.65,.65]:[.8,.9];}
export function decodeCie(v,transfer){
 const sign=Math.sign(v),a=Math.abs(v);
 if(transfer==='linear')return v;
 if(transfer.startsWith('gamma'))return sign*a**(Number(transfer.slice(5))/10);
 if(transfer==='srgb')return sign*(a<=.04045?a/12.92:((a+.055)/1.055)**2.4);
 if(transfer==='bt709')return sign*(a<.081?a/4.5:((a+.099)/1.099)**(1/.45));
 if(v<0)return NaN;
 if(transfer==='pq'){const p=v**(32/2523),den=2413/128-2392/128*p;return den>0?(Math.max(p-3424/4096,0)/den)**(16384/2610):NaN;}
 // HLG: inverse OETF followed by neutral 1000-nit reference display OOTF.
 // The common Y-dependent OOTF multiplier cancels in chromaticity coordinates.
 if(transfer==='hlg')return v<=.5?v*v/3:(Math.exp((v-.55991073)/.17883277)+.28466892)/12;
 return NaN;
}
export function xyzChromaticity(x,y,z,model='xy'){
 if(![x,y,z].every(Number.isFinite))return null;
 const den=model==='uv'?x+15*y+3*z:x+y+z;
 if(y<=1e-12||den<=1e-12)return null;
 return model==='uv'?[4*x/den,9*y/den]:[x/den,y/den];
}
export function xyToCie(x,y,model='xy'){return model==='uv'?[4*x/(-2*x+12*y+3),9*y/(-2*x+12*y+3)]:[x,y];}
export function ciePoint(rgb,c){
 if(!cieReady(c)||!rgb.every(Number.isFinite))return null;
 return cieLinearPoint(rgb.map(x=>decodeCie(x,c.cieTransfer)),c);
}
export function cieLinearPoint(v,c){
 const m=CIE_PRIMARIES[c.ciePrimaries].matrix;
 return xyzChromaticity(m[0]*v[0]+m[1]*v[1]+m[2]*v[2],m[3]*v[0]+m[4]*v[1]+m[5]*v[2],m[6]*v[0]+m[7]*v[1]+m[8]*v[2],c.cieModel);
}
export function cieDistribution(frame,c,decode,select){
 const enabled=c.activeScopes.includes(11),cie=new Uint32Array(enabled?c.cieSize*c.cieSize:1),stats={ready:cieReady(c),plotted:0,undefined:0,invalid:0,outside:0,excluded:0};
 if(!enabled||!stats.ready)return {cie,cieStats:stats};
 const [bx,by]=cieBounds(c.cieModel),n=c.cieSize;
 for(let y=c.y0;y<c.y1;y++)for(let x=c.x0;x<c.x1;x++){
  const at=(y*frame.width+x)*3,rgb=decode(frame.data[at],frame.data[at+1],frame.data[at+2],frame.signal);
  if(!select(rgb)){stats.excluded++;continue;}
  const linear=rgb.map(v=>decodeCie(v,c.cieTransfer));if(!linear.every(Number.isFinite)){stats.invalid++;continue;}
  const p=cieLinearPoint(linear,c);if(!p){stats.undefined++;continue;}
  if(p[0]<0||p[0]>bx||p[1]<0||p[1]>by){stats.outside++;continue;}
  cie[Math.round(p[1]/by*(n-1))*n+Math.round(p[0]/bx*(n-1))]++;stats.plotted++;
 }
 return {cie,cieStats:stats};
}
