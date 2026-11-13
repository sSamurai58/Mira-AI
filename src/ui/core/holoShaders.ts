/** WebGL2 shaders for the holographic Mira core (ported from docs/mira-holo-core-ref.html). */

export const HOLO_VS = `#version 300 es
in vec2 aQ;in vec3 aA;in vec3 aB;in vec4 aS;in vec2 aW;
uniform mat4 uP,uV;uniform vec2 uRes;uniform float uCamD,uTime,uRadius,uSpeed,uVis,uSeed,uBreath,uDir,uAlpha,uFlash,uSpark,uPR;uniform vec3 uColor;
out vec3 vC;out float vA;out float vS;
vec3 rot(vec3 p,vec3 k,float a){return p*cos(a)+cross(k,p)*sin(a)+k*dot(k,p)*(1.-cos(a));}
void main(){
 float t=uTime,env=1.,br=1.,pu=0.;vec3 a=aA,b=aB;
 if(uSpark>.5){float f=fract(t*aS.w*.12+aS.y);vec3 d=normalize(aA);float rr=uRadius*(.9+f*.7);a=d*rr;b=d*(rr+.06);env=sin(f*3.14159);br=1.4;}
 else{pu=pow(max(0.,sin(aW.y*3.-t*aS.w+aS.y*6.2832)),6.);br=.2+.1*aS.z+pu*aS.z*1.3;
  float h=fract(sin(floor(t*4.+aS.y*50.)*12.9898+aS.y*78.233)*43758.5453);if(h>.97)br*=1.8;}
 vec3 m=(a+b)*.5;
 vec3 ax=normalize(vec3(sin(t*.13+uSeed),cos(t*.17+uSeed*2.),sin(t*.11+uSeed*3.)+.6));
 float ang=t*uSpeed*uDir*(1.+.3*sin(m.y*2.5/max(uRadius,.1)+aS.y*6.+t*.2));
 a=rot(a,ax,ang);b=rot(b,ax,ang);
 float g=smoothstep(0.,1.,uVis);float sc=(.25+.75*g)*(1.+.07*sin(t*uBreath+uSeed*4.)+.04*uFlash);a*=sc;b*=sc;
 vec4 mvA=uV*vec4(a,1.),mvB=uV*vec4(b,1.);vec4 ca=uP*mvA,cb=uP*mvB;
 vec2 pa=ca.xy/ca.w*uRes*.5,pb=cb.xy/cb.w*uRes*.5;vec2 dp=pb-pa;float L=length(dp);
 vec2 dn=L>.001?dp/L:vec2(1.,0.);vec2 nr=vec2(-dn.y,dn.x);float e=aQ.x,s=aQ.y,th=aW.x*uPR;
 vec2 px=(e<.5?pa:pb)+dn*(e<.5?-1.:1.)*th*.5+nr*s*th*.5;vec4 base=e<.5?ca:cb;
 gl_Position=vec4(px/(uRes*.5)*base.w,base.z,base.w);
 float fade=clamp((uVis-aS.x*.7)*3.,0.,1.);float depth=smoothstep(-.3,.6,-mvA.z-uCamD);
 vA=env*fade*uAlpha*br*(1.+uFlash*.4)*mix(1.,.2,depth);
 vC=mix(uColor,vec3(1.,.8,.4),clamp(pu*.3,0.,1.));vS=s;
}`;

export const HOLO_FS = `#version 300 es
precision mediump float;in vec3 vC;in float vA;in float vS;out vec4 o;
void main(){float a=clamp(vA*(1.-.75*smoothstep(.25,1.,abs(vS))),0.,1.);o=vec4(vC*a,1.);}`;

export const HOLO_QV = `#version 300 es
out vec2 uv;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.-1.,0.,1.);}`;

export const HOLO_BF = `#version 300 es
precision mediump float;in vec2 uv;uniform sampler2D t;uniform vec2 d;uniform float th;out vec4 o;
void main(){vec3 c=vec3(0.);float w[5]=float[](.227,.194,.121,.054,.016);
 vec3 s0=texture(t,uv).rgb;if(th>0.)s0=max(s0-th,0.);c=s0*w[0];
 for(int i=1;i<5;i++){vec3 a=texture(t,uv+d*float(i)*1.6).rgb,b=texture(t,uv-d*float(i)*1.6).rgb;if(th>0.){a=max(a-th,0.);b=max(b-th,0.);}c+=(a+b)*w[i];}
 o=vec4(c,1.);}`;

/** Composite scene + bloom; alpha from luminance so Home stays transparent around the core. */
export const HOLO_CF = `#version 300 es
precision mediump float;in vec2 uv;uniform sampler2D s,b,b2;uniform float k;out vec4 o;
void main(){
 vec3 col=texture(s,uv).rgb+(texture(b,uv).rgb*1.0+texture(b2,uv).rgb*1.2)*k;
 float a=clamp(max(col.r,max(col.g,col.b))*1.15,0.,1.);
 o=vec4(col,a);
}`;
